import { HttpException } from '@nestjs/common';

/**
 * Excepción base con `code` estable para el frontend (ADR-00 §7). Toda
 * excepción de negocio de los servicios extiende esta clase (ej.
 * `LimitePlanAlcanzadoException`, `InvitacionExpiradaException`);
 * `HttpExceptionFilter` la traduce al sobre `ApiErrorResponse`.
 *
 * `extras` (opcional) son campos adicionales que la spec de una fase pide en
 * el body del error (ej. fase-04: `{ recurso: 'grupos' }` junto al code
 * `LIMITE_PLAN_ALCANZADO`) — el filtro los agrega al sobre sin tocar los
 * cuatro campos garantizados de `ApiErrorResponse`.
 */
export class DomainException extends HttpException {
  readonly code: string;

  readonly extras?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    extras?: Record<string, unknown>
  ) {
    super(message, statusCode);
    this.code = code;
    this.extras = extras;
  }
}
