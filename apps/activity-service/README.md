# activity-service — despliegue

Catálogo de actividades y conductas + registro de cumplimiento (Fases 5 y 7A):
completar / no-hizo / conductas / cronómetro. Cada registro guarda su snapshot
de puntos con signo y publica el evento que scoring proyecta al ledger. Base
propia `activity_db`.

## Variables de entorno

| Variable | Secreta | Descripción |
|---|:--:|---|
| `PORT` | no | Puerto HTTP (default 3003). |
| `DATABASE_URL` | **sí** | Postgres de `activity_db`. |
| `RABBITMQ_URL` | **sí** | Conexión AMQP (publica eventos de registro). |
| `GATEWAY_INTERNAL_SECRET` | **sí** | Valida `x-internal-secret`. |
| `JWT_PUBLIC_KEY` | no | Clave pública RS256 (base64). |
| `IDENTITY_INTERNAL_URL` | no | REST interno a identity (validar usuario/grupo). |
| `BILLING_INTERNAL_URL` | no | REST interno a billing (límite de plan de actividades). |
| `SESSION_INTERNAL_URL` | no | REST interno a session (resolver la Sesión ABIERTA). |
| `LOG_LEVEL` | no | Nivel de log pino. |

## Build / start / migraciones

```bash
pnpm nx run activity-service:prisma-migrate   # dev
npx prisma migrate deploy                      # producción (cwd apps/activity-service)
pnpm nx build activity-service
node dist/apps/activity-service/main.js
```

## Healthcheck

`GET /internal/health` → `{ status: 'ok', service: 'activity-service' }`.

## Dependencias externas

- **Base de datos**: `activity_db` (Postgres 18).
- **Llama a**: identity-service, billing-service, session-service (REST interno).
- **Publica eventos**: `ActividadCompletada`, `NoHizoRegistrado`,
  `ConductaRegistrada`, `ConductaRegistroEliminado`,
  `AccionAdministrativaRegistrada`.
- **Consume colas**: ninguna.
