/**
 * Sobre único de error HTTP para TODOS los servicios (ADR-00 §7). El frontend
 * puede asumir este shape para cualquier respuesta no-2xx de cualquier
 * servicio, sin casos especiales.
 */
export interface ApiErrorResponse {
  statusCode: number;
  /** Código estable para el frontend, ej. 'LIMITE_PLAN_ALCANZADO'. */
  code: string;
  /** Mensaje legible, en español, para mostrar o loguear. */
  message: string;
  /** El mismo correlationId de ADR-00 §5, para cruzar con los logs. */
  correlationId: string;
}
