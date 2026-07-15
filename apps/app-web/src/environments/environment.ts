/**
 * Entorno de desarrollo. TODO el tráfico va al Gateway (localhost:3000/api),
 * nunca directo a un servicio interno — regla del proyecto, ver CLAUDE.md.
 *
 * La URL de producción se define en Fase 13 (piloto/deploy) vía
 * fileReplacements o variable de build — hueco documentado en
 * docs/progreso/fase-03-gateway-frontend-auth.md.
 */
export const environment = {
  apiBaseUrl: 'http://localhost:3000/api',
};
