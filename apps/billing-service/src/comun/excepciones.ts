import { DomainException } from '@dorado/shared-auth';

// Excepciones tipadas de billing-service (ADR-00 §7): cada una lleva su
// `code` estable; HttpExceptionFilter las traduce al sobre ApiErrorResponse.

export class SuscripcionNoEncontradaException extends DomainException {
  constructor() {
    super(
      'SUSCRIPCION_NO_ENCONTRADA',
      'La organización todavía no tiene una suscripción registrada',
      404
    );
  }
}
