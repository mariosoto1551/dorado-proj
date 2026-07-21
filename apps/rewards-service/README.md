# rewards-service — despliegue

Catálogo de recompensas por zona (con snapshot) y canjes (Fase 8): elegibles
derivados del `ResultadoSeccion` de scoring, selección/sorteo con canje único
por sección, entrega. Base propia `rewards_db`.

## Variables de entorno

| Variable | Secreta | Descripción |
|---|:--:|---|
| `PORT` | no | Puerto HTTP (default 3006). |
| `DATABASE_URL` | **sí** | Postgres de `rewards_db`. |
| `RABBITMQ_URL` | **sí** | Conexión AMQP (consume `ZonaAlcanzada`; publica `RecompensaCanjeada`). |
| `GATEWAY_INTERNAL_SECRET` | **sí** | Valida `x-internal-secret`. |
| `JWT_PUBLIC_KEY` | no | Clave pública RS256 (base64). |
| `IDENTITY_INTERNAL_URL` | no | REST interno a identity (usuarios/nombres). |
| `SCORING_INTERNAL_URL` | no | REST interno a scoring (resultado de sección). |
| `LOG_LEVEL` | no | Nivel de log pino. |

## Build / start / migraciones

```bash
pnpm nx run rewards-service:prisma-migrate    # dev
npx prisma migrate deploy                       # producción (cwd apps/rewards-service)
pnpm nx build rewards-service
node dist/apps/rewards-service/main.js
```

## Healthcheck

`GET /internal/health` → `{ status: 'ok', service: 'rewards-service' }`.

## Dependencias externas

- **Base de datos**: `rewards_db` (Postgres 18).
- **Llama a**: identity-service, scoring-service (REST interno).
- **Consume colas**: `rewards.q.zonas-alcanzadas` (evento `ZonaAlcanzada` con
  `esEvaluacionFinal=true`).
- **Publica eventos**: `RecompensaCanjeada`, `AccionAdministrativaRegistrada`.
