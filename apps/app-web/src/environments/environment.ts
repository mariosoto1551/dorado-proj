/**
 * Entorno de desarrollo y "modo casa". TODO el tráfico va al Gateway
 * (`/api`), nunca directo a un servicio interno — regla del proyecto (CLAUDE.md).
 *
 * `apiBaseUrl` se DERIVA del host desde el que se abre la app (no hardcodeado):
 * si un celular de la familia entra a `http://192.168.1.50:4200`, la app le
 * pega al Gateway en `http://192.168.1.50:3000/api` automáticamente. Así el
 * mismo build sirve para localhost y para cualquier IP de la red de casa, sin
 * reconstruir. En producción se reemplaza por `environment.prod.ts`
 * (URL fija del Gateway) vía `fileReplacements`.
 *
 * El guard `typeof window` es por el prerender de Angular (corre en Node, sin
 * `window`): ahí cae al default; en el navegador siempre usa el host real.
 */
const loc = typeof window !== 'undefined' ? window.location : null;

export const environment = {
  apiBaseUrl: loc ? `${loc.protocol}//${loc.hostname}:3000/api` : 'http://localhost:3000/api',
};
