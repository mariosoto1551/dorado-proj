# app-web — despliegue

SPA de la aplicación (Angular 22, zoneless, signal-first) — panel de tutores y
usuarios (Fase 10). **No guarda tokens en `localStorage`/`sessionStorage`**: el
access token vive en memoria (signal) y el refresh en cookie `httpOnly` (regla
7). Todo el tráfico va al Gateway.

## Configuración

El endpoint del backend se resuelve en build time desde
`src/environments/environment.ts` (`apiBaseUrl`, default
`http://localhost:3000/api`). Para producción, apuntar `apiBaseUrl` al Gateway
público (vía `environment.prod.ts` / `fileReplacements` de la config de build de
Angular). No usa variables de entorno en runtime (es estático).

## Build / serve

```bash
pnpm nx serve app-web                 # dev (:4200)
pnpm nx build app-web                 # → dist/apps/app-web (estático)
```

## Despliegue

Artefacto **100% estático** (`dist/apps/app-web`): servir desde cualquier CDN /
hosting estático con fallback SPA a `index.html`. Requisitos:

- El Gateway debe permitir el origen de `app-web` por CORS (`APP_WEB_URL`).
- El dominio debe servirse por HTTPS para que la cookie `httpOnly` de refresh
  (con `REFRESH_COOKIE_SECURE=true` en identity) funcione.

## Healthcheck / dependencias

- No tiene healthcheck propio (estático). Depende en runtime del **Gateway**.
- No consume colas ni base de datos.
