/**
 * Entorno de PRODUCCIÓN de admin-web. Reemplaza a environment.ts en el build
 * `--configuration=production` vía `fileReplacements` (ver project.json).
 * DEBE apuntar al Gateway público (dominio de Render) con sufijo `/api`.
 * Ver docs/runbook-deploy.md.
 */
export const environment = {
  apiBaseUrl: 'https://REEMPLAZAR-CON-GATEWAY.onrender.com/api',
};
