/**
 * Entorno de la variante LIBRE (despliegue gratuito de origen único —
 * `docs/runbook-deploy-libre.md`).
 *
 * `apiBaseUrl` es **relativo**, y es la pieza que hace funcionar todo lo demás:
 * en esta variante un solo Caddy sirve el sitio público, las dos SPAs y el
 * Gateway bajo el MISMO origen (`/app/…` y `/api/…` del mismo dominio). Con una
 * ruta relativa el navegador resuelve contra ese origen, así que:
 *
 * - **no hay CORS** — ninguna llamada es cross-origin, y no hay lista de
 *   orígenes que mantener sincronizada con el dominio;
 * - **la cookie de refresh es first-party**, que en un dominio gratuito de
 *   DuckDNS no es un detalle: `duckdns.org` está en la Public Suffix List, así
 *   que `app.loquesea.duckdns.org` y `api.loquesea.duckdns.org` serían sitios
 *   DISTINTOS para el navegador y el `SameSite=Lax` de `dorado_refresh` la
 *   bloquearía. Partir los subdominios rompería el login silenciosamente;
 * - **la imagen no lleva el dominio horneado**: el mismo build sirve para
 *   cualquier dominio, igual que en el modo casa.
 *
 * Los clientes API la usan como prefijo (`${apiBaseUrl}/scoring`), así que una
 * ruta relativa funciona sin tocar ninguno.
 */
export const environment = {
  apiBaseUrl: '/api',
};
