import { DomainException } from '@dorado/shared-auth';

/**
 * Excepciones tipadas de ai-service (ADR-00 §7).
 *
 * **Por qué existe este archivo desde el día uno**: `HttpExceptionFilter` solo
 * conserva el `code` de negocio cuando la excepción extiende
 * `DomainException`. Un `new BadRequestException({ message, code })` deja el
 * code **dentro** del body de la excepción de Nest, que el filtro descarta: al
 * cliente le llega el genérico `VALIDACION`. Los tests unitarios no lo ven
 * —inspeccionan la excepción cruda, donde el code sí está—; en rewards lo
 * destapó la E2E del fase-14-26, después de que el servicio entero se
 * escribiera del modo equivocado. Acá se arranca bien.
 *
 * Los 403/404 sin code propio siguen usando las excepciones estándar de
 * NestJS: el filtro las mapea a PROHIBIDO/NO_ENCONTRADO, que es lo correcto.
 */

/** El plan de la organización no incluye el asistente (fase-14-29 decisión 1). */
export class FeatureNoDisponibleException extends DomainException {
  constructor() {
    super(
      'FEATURE_NO_DISPONIBLE',
      'El asistente de IA no está incluido en el plan de esta organización',
      402
    );
  }
}

/**
 * El plan lo incluye pero el dueño todavía no lo prendió (decisión 5). Es
 * distinto de FEATURE_NO_DISPONIBLE a propósito: uno se resuelve cambiando de
 * plan y el otro con un clic del ORG_ADMIN, y la pantalla dice cosas
 * diferentes en cada caso.
 */
export class IaNoHabilitadaException extends DomainException {
  constructor() {
    super('IA_NO_HABILITADA', 'El asistente de IA no está habilitado en esta organización', 403);
  }
}

/** Habilitar exige aceptar el aviso de qué datos salen (decisión 5). */
export class AvisoNoAceptadoException extends DomainException {
  constructor() {
    super(
      'AVISO_NO_ACEPTADO',
      'Para habilitar el asistente hay que aceptar el aviso sobre los datos que se envían',
      400
    );
  }
}

/**
 * El aviso cambió y el consentimiento que hay es de una versión anterior
 * (fase-14-31 decisión 11).
 *
 * Es un `code` propio y no `IA_NO_HABILITADA` porque **el switch está
 * prendido**: la pantalla del Tutor tiene que decir «el dueño tiene que aceptar
 * un aviso nuevo», no «pedile que lo prenda», que lo mandaría a mirar un
 * interruptor que ya está en sí.
 */
export class AvisoDesactualizadoException extends DomainException {
  constructor(aceptada: number | null, vigente: number) {
    super(
      'AVISO_DESACTUALIZADO',
      'El aviso sobre los datos que se envían al proveedor cambió: un administrador de la ' +
        'organización tiene que aceptarlo de nuevo para volver a usar el asistente',
      403,
      { aceptada, vigente }
    );
  }
}

/**
 * Se agotó la cuota mensual de tokens de la organización (decisión 1). Se
 * lanza ANTES de llamar al proveedor, nunca después: los tokens los paga la
 * plataforma, así que cortar tarde ya costó dinero.
 */
export class CuotaIaAgotadaException extends DomainException {
  constructor(consumidos: number, cuota: number) {
    super(
      'CUOTA_IA_AGOTADA',
      'Se agotó la cuota mensual de tokens del asistente para esta organización',
      402,
      { consumidos, cuota }
    );
  }
}

/** Pasaron más de 24 h desde que se armó (decisión 12). Se puede leer, no aplicar. */
export class PropuestaVencidaException extends DomainException {
  constructor() {
    super(
      'PROPUESTA_VENCIDA',
      'La propuesta venció: el estado del grupo pudo cambiar desde que se armó',
      409
    );
  }
}

/** La propuesta ya se aplicó o se descartó: no vuelve a BORRADOR. */
export class PropuestaNoAplicableException extends DomainException {
  constructor() {
    super('PROPUESTA_NO_APLICABLE', 'La propuesta ya no está en estado aplicable', 409);
  }
}

/** El proveedor no respondió o devolvió error (decisión 9 de la Parte E). */
export class ProveedorNoDisponibleException extends DomainException {
  constructor() {
    super('PROVEEDOR_NO_DISPONIBLE', 'El asistente no está disponible en este momento', 503);
  }
}
