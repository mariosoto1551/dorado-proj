/**
 * Entorno de PRODUCCIÓN (Fase 13). Reemplaza a environment.ts en el build
 * `--configuration=production` vía `fileReplacements` (ver project.json).
 *
 * `apiBaseUrl` DEBE apuntar al Gateway público (dominio de Render), con el
 * sufijo `/api`. Todo el tráfico pasa por el Gateway (regla del proyecto).
 *
 * Se puede sobreescribir en el build sin tocar este archivo exportando
 * `APP_GATEWAY_URL` y usando el `define` del builder — pero el camino simple
 * del piloto es fijar acá la URL real una vez que el Gateway está desplegado.
 * Ver docs/runbook-deploy.md.
 */
export const environment = {
  apiBaseUrl: 'https://REEMPLAZAR-CON-GATEWAY.onrender.com/api',
};
