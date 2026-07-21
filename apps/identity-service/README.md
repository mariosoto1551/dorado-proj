# identity-service — despliegue

Autenticación y autorización (ADR-00 §3): organizaciones, tutores, usuarios,
grupos, invitaciones, internos de tutores. **Emisor único de los JWT** (posee
la clave privada RS256). Base propia `identity_db`.

## Variables de entorno

| Variable | Secreta | Descripción |
|---|:--:|---|
| `PORT` | no | Puerto HTTP (default 3001). |
| `DATABASE_URL` | **sí** | Postgres de `identity_db`. |
| `RABBITMQ_URL` | **sí** | Conexión AMQP (publica eventos de dominio). |
| `GATEWAY_INTERNAL_SECRET` | **sí** | Debe coincidir con el del Gateway (valida `x-internal-secret`). |
| `BILLING_INTERNAL_URL` | no | REST interno a billing (límites de plan). |
| `JWT_PRIVATE_KEY` | **sí** | Clave **privada** RS256 (base64) — firma los tokens. **Solo este servicio la tiene.** |
| `JWT_PUBLIC_KEY` | no | Clave pública RS256 (base64). |
| `REFRESH_COOKIE_SECURE` | no | `true` en producción (cookie `httpOnly` de refresh sobre HTTPS). |
| `LOG_LEVEL` | no | Nivel de log pino. |

## Build / start / migraciones

```bash
pnpm nx run identity-service:prisma-migrate   # dev (migrate dev)
npx prisma migrate deploy                      # producción (cwd apps/identity-service)
pnpm nx build identity-service
node dist/apps/identity-service/main.js
```

## Healthcheck

`GET /internal/health` → `{ status: 'ok', service: 'identity-service' }` (sin guard).

## Dependencias externas

- **Base de datos**: `identity_db` (Postgres 18).
- **Llama a**: billing-service (REST interno).
- **Publica eventos**: `OrganizacionCreada`, `InvitacionGenerada`,
  `InvitacionCanjeada`, `UsuarioUnido`, `AccionAdministrativaRegistrada`.
- **Consume colas**: ninguna.
