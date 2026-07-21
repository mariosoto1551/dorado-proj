# audit-service — despliegue

Auditoría inmutable de solo lectura (Fase 9): consume todos los eventos de
dominio relevantes y los persiste como `RegistroAuditoria` (append-only, sin
UPDATE/DELETE), con timeline por entidad. Base propia `audit_db`.

## Variables de entorno

| Variable | Secreta | Descripción |
|---|:--:|---|
| `PORT` | no | Puerto HTTP (default 3008). |
| `DATABASE_URL` | **sí** | Postgres de `audit_db`. |
| `RABBITMQ_URL` | **sí** | Conexión AMQP (consume eventos de dominio). |
| `GATEWAY_INTERNAL_SECRET` | **sí** | Valida `x-internal-secret`. |
| `JWT_PUBLIC_KEY` | no | Clave pública RS256 (base64). |
| `LOG_LEVEL` | no | Nivel de log pino. |

## Build / start / migraciones

```bash
pnpm nx run audit-service:prisma-migrate      # dev
npx prisma migrate deploy                       # producción (cwd apps/audit-service)
pnpm nx build audit-service
node dist/apps/audit-service/main.js
```

## Healthcheck

`GET /internal/health` → `{ status: 'ok', service: 'audit-service' }`.

## Dependencias externas

- **Base de datos**: `audit_db` (Postgres 18). Tabla `RegistroAuditoria`
  append-only — el servicio no expone ningún endpoint de escritura/edición.
- **Llama a**: ningún servicio (los nombres ya vienen resueltos en el evento
  `AccionAdministrativaRegistrada`).
- **Consume colas**: `audit.q.eventos-dominio` (todos los eventos auditables,
  incluido `AccionAdministrativaRegistrada` de cada servicio).
- **Publica eventos**: ninguno.
