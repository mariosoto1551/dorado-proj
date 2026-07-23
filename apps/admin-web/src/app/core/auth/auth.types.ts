/** Sobre de error único de todos los servicios y del Gateway (ADR-00 §7). */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
}
