# session-service — despliegue

Configuración de Sesión/Sección por grupo + máquina de estados (Fase 6) con
scheduler automático (cron + timezone). Publica el ciclo de vida de
Sesión/Sección que scoring consume para evaluar. Base propia `session_db`.

## Variables de entorno

| Variable | Secreta | Descripción |
|---|:--:|---|
| `PORT` | no | Puerto HTTP (default 3004). |
| `DATABASE_URL` | **sí** | Postgres de `session_db`. |
| `RABBITMQ_URL` | **sí** | Conexión AMQP (publica eventos de sesión/sección). |
| `GATEWAY_INTERNAL_SECRET` | **sí** | Valida `x-internal-secret`. |
| `JWT_PUBLIC_KEY` | no | Clave pública RS256 (base64). |
| `IDENTITY_INTERNAL_URL` | no | REST interno a identity (timezone del grupo). |
| `LOG_LEVEL` | no | Nivel de log pino. |

## Build / start / migraciones

```bash
pnpm nx run session-service:prisma-migrate    # dev
npx prisma migrate deploy                       # producción (cwd apps/session-service)
pnpm nx build session-service
node dist/apps/session-service/main.js
```

> **Scheduler**: en modo `AUTOMATICO` un cron interno abre/cierra Sesiones y
> Secciones según la timezone del grupo. Correr **una sola instancia** del
> scheduler (o coordinarlo) para no duplicar transiciones si se escala horizontal.

## Healthcheck

`GET /internal/health` → `{ status: 'ok', service: 'session-service' }`.

## Dependencias externas

- **Base de datos**: `session_db` (Postgres 18).
- **Llama a**: identity-service (REST interno).
- **Publica eventos**: `SesionAbierta`, `SesionCerrada`, `SeccionAbierta`,
  `SeccionEntroEvaluacion`, `SeccionCerrada`.
- **Consume colas**: ninguna.
