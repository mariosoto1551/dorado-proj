# billing-service — despliegue

Suscripciones y entitlements por organización (Fase 4). Crea la suscripción
FREE al consumir `OrganizacionCreada`, expone los límites de plan que consultan
identity/activity, y siembra los `Plan` FREE/PRO en su bootstrap. Base propia
`billing_db`.

## Variables de entorno

| Variable | Secreta | Descripción |
|---|:--:|---|
| `PORT` | no | Puerto HTTP (default 3002). |
| `DATABASE_URL` | **sí** | Postgres de `billing_db`. |
| `RABBITMQ_URL` | **sí** | Conexión AMQP (consume `OrganizacionCreada`). |
| `GATEWAY_INTERNAL_SECRET` | **sí** | Valida `x-internal-secret` del Gateway y de los REST internos. |
| `JWT_PUBLIC_KEY` | no | Clave pública RS256 (base64). |
| `LOG_LEVEL` | no | Nivel de log pino. |

## Build / start / migraciones

```bash
pnpm nx run billing-service:prisma-migrate    # dev
npx prisma migrate deploy                       # producción (cwd apps/billing-service)
pnpm nx build billing-service
node dist/apps/billing-service/main.js
```

> El seed de planes FREE/PRO corre solo al bootstrap (`seed-planes.service.ts`);
> también puede aplicarse aparte con `npx prisma db seed` en `apps/billing-service`.

## Healthcheck

`GET /internal/health` → `{ status: 'ok', service: 'billing-service' }`.

## Dependencias externas

- **Base de datos**: `billing_db` (Postgres 18).
- **Consume colas**: `billing.q.suscripciones` (evento `OrganizacionCreada`).
- **Llama a**: ningún servicio.
- **Publica eventos**: ninguno (solo lectura hacia afuera vía REST interno).
