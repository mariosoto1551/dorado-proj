import { DomainException } from '@dorado/shared-auth';

// Excepciones tipadas de identity-service (ADR-00 §7): cada una lleva su
// `code` estable; HttpExceptionFilter las traduce al sobre ApiErrorResponse.

export class CredencialesInvalidasException extends DomainException {
  constructor() {
    // Mensaje genérico a propósito: no revelar cuál campo falló (spec fase-02).
    super('CREDENCIALES_INVALIDAS', 'Identificador o contraseña incorrectos', 401);
  }
}

export class RefreshTokenInvalidoException extends DomainException {
  constructor() {
    super('REFRESH_TOKEN_INVALIDO', 'La sesión expiró o fue revocada — iniciá sesión de nuevo', 401);
  }
}

export class IdentificadorEnUsoException extends DomainException {
  constructor() {
    super('IDENTIFICADOR_EN_USO', 'Ese email o nombre de usuario ya está registrado', 409);
  }
}

export class InvitacionNoEncontradaException extends DomainException {
  constructor() {
    super('INVITACION_NO_ENCONTRADA', 'La invitación no existe', 404);
  }
}

export class InvitacionNoCanjeableException extends DomainException {
  constructor(estado: string) {
    super(
      'INVITACION_NO_CANJEABLE',
      `La invitación ya no está disponible (${estado})`,
      410
    );
  }
}

export class InvitacionNoRevocableException extends DomainException {
  constructor(estado: string) {
    super(
      'INVITACION_NO_REVOCABLE',
      `Solo se puede revocar una invitación pendiente (estado actual: ${estado})`,
      409
    );
  }
}

export class LimitePlanAlcanzadoException extends DomainException {
  constructor(recurso: string) {
    super('LIMITE_PLAN_ALCANZADO', `El plan actual no permite crear más ${recurso}`, 403);
  }
}
