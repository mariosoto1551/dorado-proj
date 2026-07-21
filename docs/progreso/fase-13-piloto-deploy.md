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

## Verificación hecha en esta sesión

- **app-web build de producción**: `nx build app-web --configuration=production`
  en verde; `fileReplacements` reemplaza el entorno (el bundle prod NO contiene
  `localhost:3000`, sí el placeholder de gateway prod). `outputDirectory` del
  vercel.json (`dist/apps/app-web/browser`) confirmado con `index.html`.
- **Imagen Docker** (scoring-service): el build atraviesa install del monorepo +
  `nx build` (webpack) + install de runtime; se resolvieron sobre la marcha tres
  cosas reales (documentadas abajo): `nx prune` no corre en contenedor, falta
  OpenSSL en la imagen slim, y pnpm 11 bloquea los build scripts de Prisma sin
  `allowBuilds`. **La validación local completa está limitada por la red de este
  equipo** (~32 KiB/s, timeouts en fetch de npm/attestations) — el build se
  reintentó varias veces avanzando cada vez más. **Se confirma en CI/Render**
  (red rápida) antes del deploy real; no es un defecto del Dockerfile.

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
- **`nx prune` no funciona dentro del contenedor** (falla en `prune-lockfile`,
  exit 130) — se evitó: el runtime instala desde el `package.json` que genera
  webpack (`generatePackageJson`), agregando `pg` (peer de `@prisma/adapter-pg`)
  y el CLI de Prisma para migrar.
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
