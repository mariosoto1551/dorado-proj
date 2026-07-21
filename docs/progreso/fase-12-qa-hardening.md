# Registro de ejecución — Fase 12: Integración, QA y hardening

- **Estado**: COMPLETADA_CON_DESVIACIONES
- **Fecha de finalización**: 2026-07-21
- **Commit/rama**: `master` — commit `fase-12: qa & hardening`

## Resumen de lo implementado

Suite de verificación E2E nueva (`apps/e2e`, Playwright) + orquestador de stack
+ READMEs de despliegue por app. **No hay features nuevas** — la fase prueba y
documenta que las reglas no-negociables se sostienen end-to-end (ver nota final
de la spec).

- **`apps/e2e`** — app Nx con 4 suites, **API-first sobre el Gateway** (:3000)
  más un smoke de UI opcional. Soporte reutilizable en `src/support/`
  (`api.ts` cliente REST con reintento-429, `db.ts` acceso SQL directo a las
  bases para verificar el ledger, `rabbit.ts` Management API para DLQ/publish,
  `escenario.ts` builders + números conocidos + `poll`).
  - `flujo-completo.e2e.ts` (punto 1): registro → grupo → config MANUAL →
    umbrales/actividades/conductas/recompensa → invitación+canje usuario →
    ciclo de sección (completar/no-hizo/conductas) → **puntaje/zona con números
    conocidos: total 27 → Verde** → forzar-evaluación → selección de recompensa
    → cierre → entrega → notificaciones (`ZONA_ALCANZADA`) + timeline de
    auditoría no vacío.
  - `seguridad-aislamiento.e2e.ts` (punto 2, **test de seguridad**): 2 orgs; A
    no lee/escribe datos de B (por lista, por UUID adivinado → 404, por
    escritura → 404); un TUTOR con `grupoIds` acotado → 403 al adivinar el grupo
    de otra org; el Gateway **ignora headers de tenant forjados** (anti-spoofing).
  - `seguridad-inmutabilidad.e2e.ts` (punto 3, **test de seguridad**): editar
    `valorPuntos` no cambia los `EventoPuntos` ya escritos (verificado por SQL
    directo); corrección post-cierre = **fila nueva con `corregidoDeId`**, la
    original intacta y `ResultadoSeccion` inmutable (el ledger vivo sube pero el
    snapshot no); no hay endpoint UPDATE/DELETE de `EventoPuntos` (DELETE/PUT →
    404); no se registra sin Sesión `ABIERTA` (409).
  - `carga-bus.e2e.ts` (punto 4): 500 registros en ráfaga → scoring proyecta
    **exactamente 500** asientos (conteo SQL, sin pérdidas ni duplicados) en
    ~12–14s (umbral 60s); la **DLQ `scoring.dlq` recibe** un mensaje veneno.
- **`scripts/e2e-up.mjs`** — orquestador: infra (docker-compose) → `prisma
  migrate deploy` en las 8 bases → `nx run-many -t serve` de los 9 procesos
  backend → espera healthchecks → `nx e2e e2e` → teardown (mata el árbol de
  serve, baja infra). Flags `--keep-up`, `--no-infra`, `--serve-only`.
- **READMEs de despliegue** (insumo de Fase 13): los 9 backend
  (`gateway` + 8 servicios) + los 2 frontends (`app-web`, `public-site`) + el
  arnés `e2e`. Cada backend documenta env vars (con cuáles son secretas), build,
  start, migraciones, healthcheck y dependencias (servicios que llama, colas que
  consume/publica).

## Verificación real (stack completo levantado)

Corrida contra los 9 servicios servidos vía `nx serve` + infra docker:

```
10 passed (31.7s)   # nx e2e e2e — las 4 suites juntas
[carga] 500 registros: publicación ~9s, proyección total ~14s (umbral 60000ms)
```

Todas las suites pasan también por separado. `tsc --noEmit` y `eslint` del
proyecto `e2e` + `scripts/e2e-up.mjs`: limpios.

## Desviaciones del plan documentado (y por qué)

1. **Orquestación: stack servido local, no dockerizado** (decisión de José vía
   AskUserQuestion). La spec "recomendaba" docker-compose; hoy solo la infra
   está containerizada. La dockerización de los servicios se hace en **Fase 13**
   (deploy) y ahí se reusa. El orquestador reproduce el stack de dev tal cual.
2. **E2E en CI diferido a Fase 13** (decisión de José). El criterio "la suite
   corre en CI" **no se cumple en esta fase a propósito**: levantar los 11
   procesos en GitHub Actions se hace junto con la dockerización de deploy para
   no pelear el arranque del stack dos veces. La suite queda verde y
   reproducible localmente vía `node scripts/e2e-up.mjs`.
3. **Suite API-first sobre el Gateway + smoke de UI opcional** (`E2E_UI=1`), en
   vez de un E2E 100% navegador cruzando dos frontends. Verifica el mismo
   comportamiento con mucha menos fragilidad. El smoke de UI solo se **define**
   si `E2E_UI=1` (así no exige tener los browsers de Playwright instalados).
4. **Dos llamadas se saltean el Gateway a propósito**, sin cambiar lo que se
   prueba: el **registro de organización** va directo a identity (:3001) porque
   el Gateway limita `/auth/organizaciones` a 10/min por IP (anti fuerza bruta);
   la **ráfaga de carga** va directo a activity (:3003) por el límite global de
   100/min. Además el cliente reintenta transparente ante un 429 del límite
   global al correr muchas suites seguidas. Los servicios revalidan el JWT
   (`TenantContextGuard`), así que la llamada directa sigue autenticada.
5. **"No existe endpoint UPDATE/DELETE de `EventoPuntos`/`RegistroAuditoria`"**
   se cubre por comportamiento (DELETE/PUT → 404) **y por revisión de código**
   (documentada acá): en `scoring-service` el único controller sobre
   `/scoring/eventos-puntos` es `POST :id/corregir` (append, crea fila con
   `corregidoDeId` — `correcciones.service.ts`); `proyeccion.service.ts` y
   `correcciones.service.ts` solo hacen `create` sobre `EventoPuntos`, nunca
   `update`/`delete`. En `audit-service` el controller expone solo `GET`
   (`auditoria.controller.ts`) y el consumidor solo hace `create` sobre
   `RegistroAuditoria`. **Sin hallazgos.**
6. **Test del `PrismaTenantMiddleware`** (spec punto 2, "query sin filtro
   interceptada"): el chequeo a nivel unidad ya existe y pasa
   (`libs/shared-auth/src/lib/prisma-tenant-extension.spec.ts`); en esta fase el
   aislamiento se verifica a nivel API (una query de A jamás devuelve data de B).
   No se duplicó el test de unidad.
7. **DLQ forzada con un mensaje veneno determinista** (un `ActividadCompletada`
   **sin `grupoId`** publicado por la Management API) en vez de "apagar la base
   de un consumidor". El consumidor falla en `grupoDelEnvelope` **antes de tocar
   la base** (sin efecto lateral), reintenta una vez (`Nack(requeue)`) y en la
   reentrega va a `scoring.dlq` (`Nack(false)` → DLX). Self-contained y sin
   manipular infra.
8. **Nx auto-infiere targets de Playwright** (`e2e-ci`, etc.) por el plugin
   `@nx/playwright`; el target `e2e` propio corre `npx playwright test`.

## Deuda técnica / pendientes conocidos

- **Integración a CI** (criterio de aceptación 1): pendiente **explícito de
  Fase 13**, junto con la dockerización. Hasta entonces la suite es local.
- **Rate limit del Gateway no configurable por env** (100/min global, 10/min
  auth). Se absorbe con bypass directo (registro/carga) + reintento-429. Si en
  Fase 13 se quiere correr todo por el Gateway en CI, conviene hacer los límites
  configurables por env (hardening menor, iría en `gateway`).
- **Smoke de UI real** (`E2E_UI=1`): requiere `npx playwright install` (browsers)
  y los frontends servidos; no se ejecutó en esta sesión (los browsers no están
  instalados). El flujo de comportamiento ya está cubierto API-first.

## Qué debería verificar la próxima sesión antes de construir sobre esta fase

- **Limpiar procesos viejos en 3000–3008 antes de correr** (gotcha conocido —
  quedaron 3 dev servers de una sesión previa en 3000–3002 al empezar esta).
- `node scripts/e2e-up.mjs` debe terminar en **10/10 verde**. Requiere Docker
  (infra) y `pnpm install`. Con el stack ya arriba: `pnpm nx e2e e2e`.
- El escenario de números conocidos (27 → Verde) está en
  `apps/e2e/src/support/escenario.ts` — si cambia la matemática de scoring, ese
  es el lugar a ajustar.

## Verificación de criterios de aceptación (de `docs/phases/fase-12-qa-hardening.md`)

- [~] La suite E2E completa corre **en CI** y pasa en verde reproducible. →
  **Corre en verde local reproducible (10/10, no flaky)**; la integración a CI
  se difiere a Fase 13 por decisión de José (desviación 2).
- [x] El test de aislamiento entre tenants está documentado como **test de
  seguridad** (archivos `seguridad-aislamiento.e2e.ts` y
  `seguridad-inmutabilidad.e2e.ts`, con encabezado explícito), no mezclado con
  tests funcionales.
- [x] Todos los `README.md` de despliegue existen y están completos (9 backend +
  2 frontend + `e2e`).
- [x] No hay ningún hallazgo abierto de los puntos 1–4: los 4 áreas corren en
  verde y la revisión de código de inmutabilidad no encontró endpoints de
  mutación (desviación 5).
