/**
 * Entorno de desarrollo de admin-web. TODO el tráfico va al Gateway (`/api`),
 * nunca directo a identity — regla del proyecto (CLAUDE.md). Mismo criterio que
 * app-web: `apiBaseUrl` se DERIVA del host desde el que se abre la app, así el
 * mismo build sirve para localhost y para cualquier IP de la red local sin
 * reconstruir. En producción lo reemplaza environment.prod.ts (fileReplacements).
 */
const loc = typeof window !== 'undefined' ? window.location : null;

export const environment = {
  apiBaseUrl: loc ? `${loc.protocol}//${loc.hostname}:3000/api` : 'http://localhost:3000/api',
};
