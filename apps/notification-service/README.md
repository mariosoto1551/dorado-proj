# notification-service — despliegue

Notificaciones in-app (Fase 9): consume los eventos de dominio notificables,
resuelve nombres por REST interno y persiste una notificación por destinatario
(campana + polling del frontend). Base propia `notification_db`.

## Variables de entorno

| Variable | Secreta | Descripción |
|---|:--:|---|
| `PORT` | no | Puerto HTTP (default 3007). |
| `DATABASE_URL` | **sí** | Postgres de `notification_db`. |
| `RABBITMQ_URL` | **sí** | Conexión AMQP (consume eventos de dominio). |
| `GATEWAY_INTERNAL_SECRET` | **sí** | Valida `x-internal-secret`. |
| `JWT_PUBLIC_KEY` | no | Clave pública RS256 (base64). |
| `IDENTITY_INTERNAL_URL` | no | REST interno a identity (nombres de tutores/usuarios/grupos). |
| `ACTIVITY_INTERNAL_URL` | no | REST interno a activity (nombres de actividad/conducta). |
| `LOG_LEVEL` | no | Nivel de log pino. |

## Build / start / migraciones

```bash
pnpm nx run notification-service:prisma-migrate   # dev
npx prisma migrate deploy                           # producción (cwd apps/notification-service)
pnpm nx build notification-service
node dist/apps/notification-service/main.js
```

## Healthcheck

`GET /internal/health` → `{ status: 'ok', service: 'notification-service' }`.

## Dependencias externas

- **Base de datos**: `notification_db` (Postgres 18).
- **Llama a**: identity-service, activity-service (REST interno, resolución de nombres).
- **Consume colas**: `notification.q.eventos-dominio` (los 9 eventos
  notificables: `InvitacionGenerada`, `UsuarioUnido`, `NoHizoRegistrado`,
  `ConductaRegistrada`, `ConductaRegistroEliminado`, `SeccionEntroEvaluacion`,
  `ZonaAlcanzada`, `UsuarioDescalificado`, `RecompensaCanjeada`).
- **Publica eventos**: ninguno (notificación in-app únicamente).
