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

export class OrganizacionSuspendidaException extends DomainException {
  constructor() {
    // A diferencia de credenciales inválidas, acá SÍ se informa el motivo: es
    // una acción administrativa legítima, no una fuga sobre credenciales.
    super(
      'ORGANIZACION_SUSPENDIDA',
      'La organización está suspendida — contactá al administrador de la plataforma',
      403
    );
  }
}

export class OrganizacionNoEncontradaException extends DomainException {
  constructor() {
    super('ORGANIZACION_NO_ENCONTRADA', 'La organización no existe', 404);
  }
}

export class SoloPlatformAdminException extends DomainException {
  constructor() {
    super('SOLO_PLATFORM_ADMIN', 'Esta operación es exclusiva del panel de plataforma', 403);
  }
}

export class BillingNoDisponibleException extends DomainException {
  constructor() {
    // A diferencia del login (que tolera billing caído con fallback FREE), las
    // operaciones del panel sobre planes deben ser exactas: si billing no
    // responde, se falla en vez de mentir sobre el plan (fase-14-05).
    super('BILLING_NO_DISPONIBLE', 'El servicio de facturación no está disponible', 503);
  }
}

export class LimitePlanAlcanzadoException extends DomainException {
  constructor(recurso: 'grupos' | 'tutores' | 'usuarios') {
    // La spec fase-04 pide `recurso` en el body del 403, además del code.
    super('LIMITE_PLAN_ALCANZADO', `El plan actual no permite crear más ${recurso}`, 403, {
      recurso,
    });
  }
}
