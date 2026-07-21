# gateway — despliegue

Único punto de entrada HTTP del sistema (ADR-00 §4). Valida el JWT (RS256),
inyecta el contexto de tenant en headers internos, aplica rate limiting y
CORS, y proxya `/(api)/*` a los 8 microservicios. No tiene base de datos ni
consume colas. **Todo el tráfico de los frontends pasa por acá.**

## Variables de entorno

| Variable | Secreta | Descripción |
|---|:--:|---|
| `PORT` | no | Puerto HTTP (default 3000). |
| `JWT_PUBLIC_KEY` | no | Clave **pública** RS256 (base64) para validar los access token. |
| `GATEWAY_INTERNAL_SECRET` | **sí** | Secreto compartido que el Gateway envía en `x-internal-secret` a los servicios. |
| `APP_WEB_URL` | no | Origen permitido por CORS para `app-web`. |
| `PUBLIC_SITE_URL` | no | Origen permitido por CORS para `public-site` (registro). |
| `IDENTITY_INTERNAL_URL` … `AUDIT_INTERNAL_URL` | no | URL interna de cada uno de los 8 servicios (proxy + `/api/health`). |
| `LOG_LEVEL` | no | Nivel de log pino (`debug`/`info`/`warn`/`error`). |

## Build / start

```bash
pnpm nx build gateway                 # → dist/apps/gateway
node dist/apps/gateway/main.js        # start (producción)
pnpm nx serve gateway                 # dev
```

## Healthcheck

`GET /api/health` → `{ status: 'ok', servicios: { … } }` (agrega el estado de
los 8 servicios internos). Es la única ruta pública que el Gateway atiende por
sí mismo.

## Dependencias externas

- **Llama a**: los 8 servicios internos (proxy REST) — deben estar accesibles
  por sus `*_INTERNAL_URL`.
- **Colas**: ninguna.
- **Base de datos**: ninguna.
