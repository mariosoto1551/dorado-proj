import { DomainException } from '@dorado/shared-auth';

/**
 * Excepciones tipadas de rewards-service (ADR-00 §7), estrenadas por el
 * fase-14-26.
 *
 * **Por qué existe este archivo**: `HttpExceptionFilter` solo conserva el
 * `code` de negocio cuando la excepción extiende `DomainException`. Un
 * `new BadRequestException({ message, code })` deja el code **dentro** del body
 * de la excepción de Nest, que el filtro descarta: al cliente le llega el
 * genérico `VALIDACION`. Los tests unitarios no lo ven —inspeccionan la
 * excepción cruda, donde el code sí está—; lo destapó la E2E de este ítem al
 * mirar el sobre HTTP real.
 *
 * Los 403/404 sin code propio siguen usando las excepciones estándar de
 * NestJS: el filtro las mapea a PROHIBIDO/NO_ENCONTRADO, que es lo correcto.
 */

export class EtiquetaDuplicadaException extends DomainException {
  constructor() {
    super('ETIQUETA_DUPLICADA', 'Ya existe una etiqueta con ese nombre en el grupo', 409);
  }
}

export class EtiquetaInvalidaException extends DomainException {
  constructor() {
    super(
      'ETIQUETA_INVALIDA',
      'Alguna etiqueta no existe, no es de este grupo o está archivada',
      400
    );
  }
}

export class DemasiadasEtiquetasException extends DomainException {
  constructor(maximo: number) {
    super(
      'DEMASIADAS_ETIQUETAS',
      `Un ítem admite como máximo ${maximo} etiquetas`,
      400
    );
  }
}

export class SoloEnModoTiendaException extends DomainException {
  constructor() {
    super('SOLO_EN_MODO_TIENDA', 'La tienda no está activa en este grupo', 400);
  }
}

/** fase-14-28 decisión 4: lo que se hace nunca debita. */
export class MonedasInvalidasException extends DomainException {
  constructor() {
    super(
      'MONEDAS_INVALIDAS',
      'El rendimiento en monedas no puede ser negativo',
      400
    );
  }
}

/** fase-14-28: el `origenId` no existe, está archivado o es de otro grupo. */
export class AccionInexistenteException extends DomainException {
  constructor() {
    super(
      'ACCION_INEXISTENTE',
      'La actividad o conducta no existe, está archivada o no es de este grupo',
      400
    );
  }
}

/** fase-14-28 decisión 17: una conducta MALA no tiene nada que configurar. */
export class ConductaMalaNoRindeException extends DomainException {
  constructor() {
    super(
      'CONDUCTA_MALA_NO_RINDE',
      'Una conducta MALA no puede pagar monedas: lo que se hace nunca debita',
      400
    );
  }
}

export class SinItemsParaCrearException extends DomainException {
  constructor() {
    super(
      'SIN_ITEMS_PARA_CREAR',
      'No quedó ningún ítem de esa etiqueta para publicar',
      400
    );
  }
}
