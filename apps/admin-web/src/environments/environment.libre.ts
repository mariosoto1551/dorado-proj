/**
 * Entorno de la variante LIBRE (despliegue gratuito de origen único —
 * `docs/runbook-deploy-libre.md`). Ver la explicación completa en
 * `apps/app-web/src/environments/environment.libre.ts`: mismo criterio, mismo
 * origen, `apiBaseUrl` relativo.
 *
 * Para el panel esto además resuelve un problema propio: en la variante de
 * Vercel su origen tiene que estar en `ADMIN_WEB_URL` o el Gateway le corta
 * todas las llamadas en el preflight. Acá no hay preflight que cortar.
 */
export const environment = {
  apiBaseUrl: '/api',
};
