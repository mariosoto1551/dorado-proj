import { HttpException } from '@nestjs/common';

/**
 * Excepción base con `code` estable para el frontend (ADR-00 §7). Toda
 * excepción de negocio de los servicios extiende esta clase (ej.
 * `LimitePlanAlcanzadoException`, `InvitacionExpiradaException`);
 * `HttpExceptionFilter` la traduce al sobre `ApiErrorResponse`.
 */
export class DomainException extends HttpException {
  readonly code: string;

  constructor(code: string, message: string, statusCode: number) {
    super(message, statusCode);
    this.code = code;
  }
}
