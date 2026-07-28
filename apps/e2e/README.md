# e2e — suite de integración (Fase 12)

Suite end-to-end de la Fase 12 (QA/hardening). Corre con **Playwright** contra
el **stack completo ya levantado** y es **API-first sobre el Gateway** (:3000),
con un smoke opcional de UI. No es una app desplegable: es el arnés de pruebas.

## Suites

| Archivo | Punto de la spec | Qué verifica |
|---|---|---|
| `flujo-completo.e2e.ts` | 1 | Flujo completo multi-tenant con **números conocidos** (total 27 → Verde), recompensa, notificaciones y auditoría. |
| `seguridad-aislamiento.e2e.ts` | 2 | **Test de seguridad**: un JWT de la Org A no lee/escribe datos de la Org B (por lista, por UUID adivinado y con headers forjados). |
| `seguridad-inmutabilidad.e2e.ts` | 3 | **Test de seguridad**: editar `valorPuntos` no altera asientos pasados; corrección post-cierre = fila nueva con `corregidoDeId`; `ResultadoSeccion` intacto; no se registra sin Sesión ABIERTA. |
| `carga-bus.e2e.ts` | 4 | ~500 registros en ráfaga → scoring los proyecta sin pérdidas ni duplicados; la DLQ (`scoring.dlq`) recibe un mensaje veneno. |
| `plan-del-dia.e2e.ts` | fase-14 · ítem 17 | El **plan del día**: con el modo apagado nada cambia (retro-compatibilidad); encendido, las opcionales del tutor se esconden hasta elegirlas, se sacan mientras no se empezaron, el alta automática al completar, y el plan se vacía en la Sesión siguiente. |

## Cómo correr

Requiere Docker (infra) y el monorepo instalado (`pnpm install`).

```bash
# Ciclo completo: infra + migraciones + 9 procesos + healthchecks + Playwright + teardown
node scripts/e2e-up.mjs

# Variantes
node scripts/e2e-up.mjs --keep-up      # deja el stack arriba al terminar
node scripts/e2e-up.mjs --serve-only   # solo levanta el stack y espera (para iterar)
node scripts/e2e-up.mjs --no-infra     # asume Postgres/RabbitMQ ya arriba

# Con el stack ya levantado (por --serve-only u otra terminal):
pnpm nx e2e e2e
```

## Variables (opcionales, con defaults de dev)

`E2E_GATEWAY_URL` (`:3000`), `E2E_ACTIVITY_URL` (`:3003`), `E2E_PG_*`
(`localhost:5432` dorado/dorado_dev), `E2E_RABBIT_MGMT_URL` (`:15672`
guest/guest), `E2E_INTERNAL_SECRET`, `E2E_CARGA` (cantidad, default 500),
`E2E_CARGA_UMBRAL_MS` (default 60000), `E2E_UI=1` (habilita el smoke de UI con
`app-web`/`public-site` servidos).

## Notas

- La suite consulta las bases de los servicios **directo por SQL** solo para
  verificar el ledger (inmutabilidad, conteo exacto) — el flujo de negocio va
  siempre por el Gateway.
- El test de carga le pega **directo a activity-service** (no al Gateway) para
  no chocar con el rate limit de 100 req/min por IP.
- **Ese rate limit es el techo de crecimiento de la suite**: cada escenario
  cuesta ~10 requests de setup y el limiter da 100/min por IP. Al sumar una
  suite nueva, agrupar casos que comparten setup en un mismo test y no crear
  datos que el test no va a assertar (los umbrales de zona, por ejemplo). El
  reintento ante 429 de `support/api.ts` cubre la ventana entera (~66 s), así
  que el exceso se paga en tiempo, no en tests rojos — pero conviene no pagarlo.
- Integración a CI: pendiente de Fase 13 (junto con la dockerización de deploy)
  — ver `docs/progreso/fase-12-qa-hardening.md`.
