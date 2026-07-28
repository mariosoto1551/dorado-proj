# Runbook de despliegue — Fase 13 (piloto "Destino: Dorado")

Guía paso a paso para desplegar la plataforma y dar de alta el tenant piloto.
Pensado para ejecutarse con tus propias cuentas (Render, Vercel, CloudAMQP) —
la infra-as-code ya está en el repo, esto es el orden de operaciones.

**Plataformas elegidas** (Fase 13): **Render** (9 backend + Postgres, vía
`infra/render.yaml`), **Vercel** (2 frontends), **CloudAMQP** (RabbitMQ).

> Antes de empezar, tené a mano los **datos reales confirmados** (bloqueantes de
> la spec): catálogo de Actividades/Conductas, `username` de los 3 hijos,
> recompensas por zona. Sin eso se puede desplegar la infra, pero no completar
> el alta del tenant (pasos 7+).

---

## 0. Generar el par de claves JWT de producción

RS256 (ADR-00). En local:

```bash
node tools/generar-claves-jwt.mjs      # imprime JWT_PRIVATE_KEY y JWT_PUBLIC_KEY (base64)
```

Guardá ambas: la **pública** va a los 9 servicios; la **privada** SOLO a
identity-service. Nunca al repo.

## 1. Broker — CloudAMQP

1. Crear una instancia (plan free **Little Lemur** para el piloto).
2. **Verificar límites antes de comprometer** (spec): el free es 1 nodo →
   las colas cuórum del proyecto (`scoring.q.*`, `scoring.dlq`, etc.) corren con
   **1 réplica** (funcional, sin HA — aceptable para 1 tenant). Conexiones del
   free (~20) alcanzan para los ~9 servicios. Si el free bloqueara colas cuórum,
   pasar a un plan de 3 nodos o self-host un contenedor RabbitMQ.
3. Copiar la **AMQPS URL** → será `RABBITMQ_URL` de los 8 servicios con bus.

## 2. Base de datos — Render Postgres (1 instancia, 8 bases)

1. Al aplicar el Blueprint (paso 3) se crea `dorado-postgres` con la base
   `identity_db`. Las otras 7 se crean **una vez** con el script del repo:

   ```bash
   # Con la External Connection URL de Render:
   psql "<EXTERNAL_DATABASE_URL>" -c "CREATE DATABASE billing_db;"
   # …repetir para activity_db, session_db, scoring_db, rewards_db,
   #   notification_db, audit_db  (o adaptar infra/docker/init-databases.sh)
   ```
2. La **Internal Database URL** de Render (host `dpg-...:5432`) es la base de los
   `DATABASE_URL`: para cada servicio, la misma URL cambiando el nombre de base
   al final (`/scoring_db`, `/audit_db`, …).

## 3. Backend — Render Blueprint

1. Render → **New → Blueprint** → apuntar a `infra/render.yaml` del repo.
2. Render construye los 9 servicios con `infra/docker/Dockerfile.service`
   (inyecta `SERVICE` como build-arg). Cada servicio ya tiene su healthcheck
   (`/internal/health`, y `/api/health` el gateway).
3. Completar las env `sync: false` en el panel de cada servicio:
   - `DATABASE_URL` (paso 2, base correcta por servicio),
   - `RABBITMQ_URL` (paso 1),
   - `JWT_PUBLIC_KEY` (los 9) y `JWT_PRIVATE_KEY` (solo identity) (paso 0),
   - `GATEWAY_INTERNAL_SECRET`: Render lo **genera** en identity-service; copiar
     ese MISMO valor a los otros 8,
   - `*_INTERNAL_URL`: la URL interna de cada dependencia = `http://<nombre-del-servicio>:<puerto>`
     (ej. `IDENTITY_INTERNAL_URL=http://identity-service:3001`). El nombre es el
     del servicio en Render; el puerto, el `PORT` que ya trae el Blueprint.
   - En el **gateway**, además `APP_WEB_URL` y `PUBLIC_SITE_URL` (paso 5, CORS).
   - En **session-service**, opcionalmente `SCHEDULER_MAX_RECUPERACION_HORAS`
     (default 168 = 7 días): cuánto hacia atrás recupera el scheduler las
     transiciones que se perdieron mientras el servicio estuvo caído
     (fase-14-16). Si falta, toma el default; no hace falta configurarla.
4. Las migraciones corren **solas** al arrancar cada servicio con base
   (`entrypoint.sh` → `prisma migrate deploy`, idempotente). Billing siembra los
   planes FREE/PRO en su bootstrap.
5. Verificar que los 9 pasan healthcheck en verde. El **gateway** es el único
   con dominio público de cara a los frontends: anotá su URL
   (`https://<gateway>.onrender.com`).

> **Costo / always-on**: `session-service` tiene el scheduler cron (modo
> AUTOMATICO) — conviene que su plan no duerma. El Blueprint usa `starter` en
> los 9; podés bajar a free los sin-cron si querés ahorrar, pero session-service
> (y el gateway) conviene dejarlos en un plan que no se suspenda.
>
> Desde **fase-14-16** una suspensión ya no **pierde** transiciones: al volver,
> el scheduler reconcilia todo lo vencido en la ventana `(evaluadoHasta, ahora]`
> y lo aplica sellado con el instante programado. Pero se aplican **tarde** —
> el usuario ve su Sesión cambiar cuando el servicio despierta, no a la hora
> configurada. Por eso sigue siendo un plan always-on, ahora por puntualidad y
> no por integridad de los datos.

## 4. Frontends — Vercel

Dos proyectos Vercel, ambos con **Root Directory = raíz del repo**:

- **public-site**: usa `apps/public-site/vercel.json`. Cargar env de build:
  `PUBLIC_GATEWAY_URL` = URL del gateway (paso 3), `PUBLIC_APP_WEB_URL` = URL de
  app-web, `SITE_URL` = dominio del sitio.
- **app-web**: usa `apps/app-web/vercel.json`. El `apiBaseUrl` **no** es env de
  Vercel: editar `apps/app-web/src/environments/environment.prod.ts` poniendo
  `https://<gateway>.onrender.com/api` y commitear (el build de producción lo
  toma por `fileReplacements`).

## 5. Cerrar el círculo CORS

Volver al **gateway** en Render y setear `APP_WEB_URL` y `PUBLIC_SITE_URL` con
los dominios reales de Vercel (paso 4). Redeploy del gateway.

## 6. Verificación de humo en producción

- `GET https://<gateway>.onrender.com/api/health` → `status: ok` con los 9
  servicios.
- Abrir el `public-site` y hacer un registro de prueba (después borrarlo) para
  confirmar el flujo público real end-to-end.

---

## 7. Alta del tenant piloto — "Destino: Dorado"  ⚠️ requiere datos confirmados

> No inventar datos. Si falta el catálogo real o los `username`, frenar acá.

1. **Registrar la Organización** "Destino: Dorado" desde el `public-site` en
   producción (flujo real, no seed directo — es la prueba final del flujo público).
2. **Crear el Grupo** familiar y configurar Sesión/Sección con los valores
   confirmados (`arquitectura-base.md` 4.6):
   - `modo = AUTOMATICO`, `sesionesPorSeccion = 6`,
   - `cronSesion = "0 0 * * 1-6"` (lun–sáb), `cronCierreSeccion = "0 0 * * 1"`,
   - `evaluarUmbralesEn = SOLO_AL_CIERRE_SECCION`, timezone del grupo.
3. **Umbrales** confirmados: Rojo (<10), Amarillo (10–109), Verde (110–209),
   Dorado (210+).
4. **Catálogo real** de Actividades/Conductas (una vez confirmado por José).
5. **Invitaciones**: 2 Tutores (padres) + 3 Usuarios (hijos); canjear con los
   `username` reales confirmados.
6. **Recompensas** reales por zona.

## 8. Observación post-alta (primera semana)

- Revisar los logs estructurados (correlación) para detectar errores silenciosos
  durante el primer ciclo completo de Sección.
- **No abrir** el registro público a otras organizaciones todavía (depende de
  los pendientes de privacidad de menores — Fase 14).

---

## Anexo — validar el stack containerizado localmente (opcional, pre-deploy)

Antes de ir a la nube podés levantar el sistema **como se despliega** (imágenes,
no `nx serve`) con el mismo Dockerfile:

```bash
cp infra/docker/.env.stack.example infra/docker/.env.stack   # claves de dev
docker compose -f infra/docker/docker-compose.stack.yml --env-file infra/docker/.env.stack up --build
# luego, contra el stack containerizado:
E2E_GATEWAY_URL=http://localhost:3000 pnpm nx e2e e2e
```

Es el mismo stack que corre la suite E2E de Fase 12 en CI (ver
`.github/workflows/ci.yml`).
