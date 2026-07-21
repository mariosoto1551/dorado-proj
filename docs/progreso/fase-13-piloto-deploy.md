# Registro de ejecución — Fase 13: Piloto y despliegue inicial

- **Estado**: EN_PROGRESO (infra-as-code deploy-ready lista; deploy real y alta del tenant pendientes de datos + cuentas de José)
- **Fecha de actualización**: 2026-07-21
- **Commit/rama**: `master` — commit `fase-13: infra deploy-ready (docker/render/vercel/ci/runbook)`

## Alcance de esta sesión (decidido con José)

José eligió **"dejar todo deploy-ready"**: generar la infra-as-code y el runbook
para que él ejecute el deploy con sus cuentas (no puedo crear/usar cuentas de
Render/Vercel/CloudAMQP ni correr OAuth desde este entorno). Plataformas
(José delegó la decisión): **Render** (9 backend + Postgres), **Vercel**
(2 frontends), **CloudAMQP** (RabbitMQ).

## Lo implementado (deploy-ready)

- **`infra/docker/Dockerfile.service`** — Dockerfile único parametrizado por
  `--build-arg SERVICE`. Multi-stage: build Nx (webpack, con `generatePackageJson`)
  → runtime instala solo prod desde ese package.json (+ `pg` y CLI de Prisma en
  los servicios con base). `entrypoint.sh` corre `prisma migrate deploy`
  (idempotente) antes de arrancar. Usuario no-root. `.dockerignore` excluye
  node_modules/dist/**.env** (nunca hornear secretos).
- **`infra/docker/docker-compose.stack.yml`** — stack completo containerizado
  (9 servicios + infra) desde el Dockerfile. Doble uso: correr el sistema como
  se despliega, y ser el stack de la suite E2E en CI.
- **`infra/render.yaml`** — Blueprint de Render: 9 web services (Docker, `SERVICE`
  como build-arg) + 1 Postgres. Healthchecks, plan `starter` (session-service
  con scheduler cron no puede dormir), env `sync:false` para secretos/derivados.
- **`apps/app-web/vercel.json`** + **`apps/public-site/vercel.json`** — configs de
  Vercel (build Nx, outputDirectory correcto, SPA rewrite en app-web).
- **`apps/app-web/src/environments/environment.prod.ts`** + `fileReplacements` en
  `project.json` — cierra el hueco de Fase 03 (apiBaseUrl de prod). El build de
  producción lo toma bien (verificado).
- **`.env.production.example`** — nombres de env de prod por servicio (sin
  valores), marcando secretos.
- **`docs/runbook-deploy.md`** — paso a paso: claves JWT → CloudAMQP → Postgres
  (8 bases) → Blueprint de Render → Vercel → CORS → verificación → alta del
  tenant (con los datos confirmados) → observación post-alta.
- **`.github/workflows/ci.yml`** — job `e2e` que corre la suite de Fase 12 contra
  el stack completo (`node scripts/e2e-up.mjs`). **Cierra la deuda "E2E en CI"**
  diferida de Fase 12.

### Pivote de plataforma (por costo) → VPS único

Al llegar al alta de cuentas, se le mostró a José el costo real de Render (9
servicios always-on ≈ US$60/mes, porque son consumidores de eventos y no pueden
dormir en el free tier). **José eligió la opción VPS** (~US$6–12/mes, todo en una
máquina). Render/Vercel/CloudAMQP quedan como alternativa gestionada documentada.
Artefactos de la opción VPS:
- **`infra/docker/docker-compose.prod.yml`** — stack de producción: 9 servicios +
  Postgres + RabbitMQ + **Caddy (HTTPS automático)** en un VPS, con volúmenes
  persistentes, `restart: unless-stopped` y secretos por `.env.prod`. Con esta
  opción **no hace falta CloudAMQP** (RabbitMQ corre en el compose). Sintaxis
  validada (`docker compose config`).
- **`infra/docker/Caddyfile`** — reverse proxy HTTPS delante del gateway.
- **`infra/docker/.env.prod.example`** — secretos de prod (sin valores).
- **`infra/docker/.env.stack.example`** — claves de dev para el stack de CI/local.
- **`docs/runbook-deploy-vps.md`** — paso a paso del VPS (provisión → docker →
  clonar → env → up → DNS/TLS → Vercel para frontends → alta del tenant → operación).
- `.gitignore` endurecido: ignora `.env.*` reales, conserva los `*.example`.
- Frontends: siguen en **Vercel** (estáticos, gratis).

### "Modo casa" (LAN, gratis) — plan de prueba elegido por José

Por presupuesto ($ muy acotado), José eligió **arrancar corriendo todo en su PC**
y que la familia acceda desde sus celulares/laptops por el **WiFi de casa**
(gratis, sin nube ni dominio). Se agregó:
- **`apps/app-web/src/environments/environment.ts`**: `apiBaseUrl` ahora se
  DERIVA de `window.location` (host desde el que se abre la app) — el mismo build
  sirve para localhost y para cualquier IP de la red local, sin reconstruir.
  Producción sigue usando `environment.prod.ts` (URL fija) vía `fileReplacements`.
- **`apps/public-site/src/scripts/registro.ts`**: mismo fallback a `window.location`
  para el registro desde cualquier equipo de la red.
- **`apps/gateway/src/main.ts`**: CORS acepta orígenes de red privada
  (192.168/10/172.16-31/localhost) cuando `CORS_ALLOW_LAN=true` — REFLEJA el
  origen puntual (no `*`), así la cookie de credentials sigue funcionando. Fuera
  del modo casa, sigue la allowlist estricta (sin cambios en prod).
- **`scripts/home-up.mjs`**: un comando levanta infra + migraciones + los 9
  servicios (con `CORS_ALLOW_LAN`) + los 2 frontends en `0.0.0.0`, e imprime la
  dirección `http://<IP-de-la-PC>:4200` para la familia. Ctrl+C baja todo.
- Cookie de refresh con `REFRESH_COOKIE_SECURE=false` en LAN (http). Gateway
  build verificado tras el cambio de CORS.

## Verificación hecha en esta sesión

- **app-web build de producción**: `nx build app-web --configuration=production`
  en verde; `fileReplacements` reemplaza el entorno (el bundle prod NO contiene
  `localhost:3000`, sí el placeholder de gateway prod). `outputDirectory` del
  vercel.json (`dist/apps/app-web/browser`) confirmado con `index.html`.
- **Imagen Docker** (scoring-service): **construida y CORRIDA de verdad** contra
  la infra (postgres + rabbitmq): el contenedor migra (`prisma migrate deploy`
  → "No pending migrations to apply"), arranca Nest, **conecta a RabbitMQ** y
  registra los consumers (`scoring.q.registros-actividad`, `scoring.q.sesiones`),
  y responde `/internal/health` → `{"status":"ok"}`. Para llegar ahí se
  resolvieron seis cosas reales del empaquetado (ver más abajo). El build local
  fue lento por la red del equipo (~32 KiB/s) pero completó con el cache mount
  del store de pnpm; en CI/Render (red rápida) es directo.

## Bloqueantes reales para completar la fase (dependen de José)

- **Datos confirmados** (spec/`ADR-00` §9): catálogo real de Actividades/Conductas,
  `username` de los 3 hijos, recompensas por zona. **No inventar** (nota de la spec).
  - [ ] Catálogo real de Actividades/Conductas.
  - [ ] `username` de los 3 Usuarios.
  - [ ] Recompensas reales por zona.
- **Cuentas/credenciales** de Render, Vercel y CloudAMQP — el deploy real lo
  ejecuta José siguiendo `docs/runbook-deploy.md`.

## Deuda técnica / notas conocidas

- **Build de la imagen en este entorno**: el `pnpm install` del monorepo dentro
  del contenedor es lento/inestable por la red de este equipo (~32 KiB/s, socket
  timeouts en los fetch de metadata/attestations de npm). No es un defecto del
  Dockerfile; en CI (red rápida) o en Render buildea sin problema. Ver más abajo
  el resultado del build de validación local.
- **Seis ajustes reales del empaquetado en contenedor** (todos en
  `Dockerfile.service`, descubiertos corriendo la imagen):
  1. `nx prune` falla dentro del contenedor (`prune-lockfile`, exit 130) → se
     evita: el runtime instala desde el `package.json` que genera webpack.
  2. Falta OpenSSL en la imagen slim (motor de migraciones de Prisma) → `apt-get
     install openssl ca-certificates`.
  3. pnpm 11 bloquea los build scripts de Prisma sin `allowBuilds` → se copia el
     `pnpm-workspace.yaml` raíz a `/app`.
  4. El `package.json` de webpack **no lista** `tslib` (devDep, requerido en
     runtime) → `pnpm add tslib`.
  5. Tampoco lista `@prisma/client` (runtime del cliente generado) ni `pg` (peer
     de `@prisma/adapter-pg`) → `pnpm add @prisma/client pg` en servicios con base.
  6. Usuario no-root no puede ubicar el engine de Prisma en `node_modules` →
     `chown -R node:node /app` antes de `USER node`.
  Estos ajustes están validados con scoring-service; **conviene revalidar los
  otros 7 servicios con base** al primer deploy (mismo Dockerfile, mismas deps).
- **Render y URLs internas**: `fromService … hostport` devuelve `host:port` sin
  esquema, y los clientes internos esperan `http://…`; por eso los `*_INTERNAL_URL`
  quedaron `sync:false` con el valor exacto documentado en el runbook.
- **CloudAMQP free (1 nodo)**: las colas cuórum corren con 1 réplica (sin HA) —
  aceptable para 1 tenant piloto; el runbook marca el fallback.

## Verificación de criterios de aceptación (de `docs/phases/fase-13-piloto-deploy.md`)

- [ ] Los 9 servicios + Gateway + 2 frontends responden en producción y pasan su
  healthcheck. → **infra-as-code lista**; el deploy real lo ejecuta José.
- [ ] El flujo completo de Destino:Dorado corre en producción ≥1 ciclo de Sección
  sin intervención de emergencia. → pendiente del deploy + datos.
- [ ] Los datos reales cargados (sin seed genérico en el piloto). → pendiente de
  los datos confirmados.

## Qué debería verificar la próxima sesión

- Confirmar con José los datos bloqueantes (catálogo/usernames/recompensas).
- Validar el build de la imagen Docker en CI (o red rápida) y una corrida del
  `docker-compose.stack.yml` completo.
- Al desplegar, seguir `docs/runbook-deploy.md` en orden.
