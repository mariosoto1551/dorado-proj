# public-site — despliegue

Sitio público de marketing (Astro 7, SSG) — landing, `/precios` y `/registro`
(Fase 11). Estático salvo el island de registro, que hace `POST` al Gateway
para crear una organización.

## Variables de entorno (build time)

Se inyectan en el build (`import.meta.env.PUBLIC_*`); ver `.env.example`.

| Variable | Secreta | Descripción |
|---|:--:|---|
| `PUBLIC_GATEWAY_URL` | no | Base del Gateway para el `POST /api/auth/organizaciones` del registro. |
| `PUBLIC_APP_WEB_URL` | no | URL de `app-web` (link "iniciar sesión" tras registrarse). |
| `SITE_URL` | no | Dominio canónico del sitio (canonical, Open Graph, sitemap). |

> Cambiar cualquiera de estas exige **rebuild** (no son runtime).

## Build / dev

```bash
pnpm nx dev public-site               # dev (:4321)
pnpm nx build public-site             # → apps/public-site/dist (estático)
```

## Despliegue

Artefacto **100% estático** (`apps/public-site/dist`): CDN / hosting estático.
El registro solo funciona si el Gateway permite el origen del sitio por CORS
(`PUBLIC_SITE_URL`) — el preflight se hace contra el dominio real de despliegue.

## Healthcheck / dependencias

- Sin healthcheck propio (estático). `/registro` depende del **Gateway** +
  identity-service en runtime; el resto del sitio no hace red.
- No consume colas ni base de datos.
