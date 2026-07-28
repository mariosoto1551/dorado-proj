import { DomainException } from '@dorado/shared-auth';

// Excepciones tipadas de activity-service (ADR-00 §7): cada una lleva su
// `code` estable; HttpExceptionFilter las traduce al sobre ApiErrorResponse.
// Los 403/404 sin code de negocio propio usan las excepciones estándar de
// NestJS (el filtro las mapea a PROHIBIDO/NO_ENCONTRADO).

export class LimitePlanAlcanzadoException extends DomainException {
  constructor() {
    // La spec fase-05 pide `recurso: 'actividades'` en el body del 403.
    super(
      'LIMITE_PLAN_ALCANZADO',
      'El plan actual no permite crear más actividades en este grupo',
      403,
      { recurso: 'actividades' }
    );
  }
}

// Codes de registro (spec fase-07 Parte A, validaciones de `completar`).

export class ObligatoriaNoSeCompletaException extends DomainException {
  constructor() {
    super(
      'OBLIGATORIA_NO_SE_COMPLETA',
      'Una actividad OBLIGATORIA no se marca como completada — no hacerla es lo que se registra (no-hizo)',
      400
    );
  }
}

export class NoHaySesionAbiertaException extends DomainException {
  constructor() {
    super(
      'NO_HAY_SESION_ABIERTA',
      'No hay una Sección ABIERTA con Sesión ABIERTA en este grupo',
      409
    );
  }
}

export class LimiteRepeticionesAlcanzadoException extends DomainException {
  constructor() {
    super(
      'LIMITE_REPETICIONES_ALCANZADO',
      'La actividad ya se completó el máximo de veces permitido en esta sesión',
      409
    );
  }
}

export class DeadlineVencidoException extends DomainException {
  constructor() {
    super(
      'DEADLINE_VENCIDO',
      'Pasó la hora límite de esta actividad para la sesión en curso',
      409
    );
  }
}

export class CronometroNoIniciadoException extends DomainException {
  constructor() {
    super(
      'CRONOMETRO_NO_INICIADO',
      'La actividad exige iniciar el cronómetro antes de completarla',
      409
    );
  }
}

export class CronometroVencidoException extends DomainException {
  constructor() {
    super(
      'CRONOMETRO_VENCIDO',
      'El cronómetro de la actividad ya venció — iniciá uno nuevo si corresponde',
      409
    );
  }
}

// --- Equipos de trabajo (fase-14-09) ---

export class TareaEquipoDebeSerOpcionalException extends DomainException {
  constructor() {
    super('TAREA_EQUIPO_DEBE_SER_OPCIONAL', 'Una tarea de EQUIPO debe ser OPCIONAL', 400);
  }
}

export class EsTareaDeEquipoException extends DomainException {
  constructor() {
    super(
      'ES_TAREA_DE_EQUIPO',
      'Esta actividad es de equipo — se completa por la ruta del equipo, no individual',
      400
    );
  }
}

export class NoEsTareaDeEquipoException extends DomainException {
  constructor() {
    super('NO_ES_TAREA_DE_EQUIPO', 'La actividad no es una tarea de equipo (alcance INDIVIDUAL)', 400);
  }
}

export class SoloJefeCompletaTareaEquipoException extends DomainException {
  constructor() {
    super(
      'SOLO_JEFE_COMPLETA_TAREA_EQUIPO',
      'Solo el jefe del equipo (o un tutor) puede completar la tarea de equipo',
      403
    );
  }
}

export class EquipoNoEncontradoException extends DomainException {
  constructor() {
    super('EQUIPO_NO_ENCONTRADO', 'El equipo no existe', 404);
  }
}

export class ReportadoNoEsMiembroException extends DomainException {
  constructor() {
    super('REPORTADO_NO_ES_MIEMBRO', 'El reportado no es integrante de este equipo', 400);
  }
}

export class SoloJefeReportaException extends DomainException {
  constructor() {
    super('SOLO_JEFE_REPORTA', 'Solo el jefe del equipo puede reportar a un integrante', 403);
  }
}

export class ConductaNoEsMalaException extends DomainException {
  constructor() {
    super('CONDUCTA_NO_ES_MALA', 'El reporte debe referir una conducta MALA activa del grupo', 400);
  }
}

export class ReporteNoEncontradoException extends DomainException {
  constructor() {
    super('REPORTE_NO_ENCONTRADO', 'El reporte no existe', 404);
  }
}

export class ReporteYaResueltoException extends DomainException {
  constructor() {
    super('REPORTE_YA_RESUELTO', 'El reporte ya fue aprobado o rechazado', 409);
  }
}

// --- Marcas rojas del tutor (fase-14-12) ---

export class ActividadDenegadaPorTutorException extends DomainException {
  constructor() {
    super(
      'ACTIVIDAD_DENEGADA_POR_TUTOR',
      'Un tutor marcó que esta actividad no se hizo — solo él puede deshacer la marca',
      409
    );
  }
}

export class MarcaNoReversibleException extends DomainException {
  constructor() {
    super(
      'MARCA_NO_REVERSIBLE',
      'El registro no es una marca roja viva: no hay nada que deshacer',
      409
    );
  }
}

// --- Actividades programadas (fase-14-11) ---

export class ActividadNoDisponibleHoyException extends DomainException {
  constructor(diasSemana: number[]) {
    super(
      'ACTIVIDAD_NO_DISPONIBLE_HOY',
      'La actividad está programada para otros días de la semana',
      409,
      // Los días viajan en el error para que el cliente pueda decir cuáles son
      // sin tener que ir a buscar la actividad de nuevo.
      { diasSemana }
    );
  }
}

// --- Contenido creado por los integrantes (fase-14-10) ---

export class CreacionPorUsuarioDeshabilitadaException extends DomainException {
  constructor() {
    super(
      'CREACION_POR_USUARIO_DESHABILITADA',
      'El grupo no permite que los integrantes creen sus propias actividades',
      403
    );
  }
}

export class PuntosSobreTopeDelGrupoException extends DomainException {
  constructor(tope: number) {
    super(
      'PUNTOS_SOBRE_TOPE_DEL_GRUPO',
      `Una actividad creada por un integrante puede valer como máximo ${tope} puntos en este grupo`,
      400,
      { tope }
    );
  }
}

export class LimiteActividadesPropiasAlcanzadoException extends DomainException {
  constructor(tope: number) {
    super(
      'LIMITE_ACTIVIDADES_PROPIAS_ALCANZADO',
      `Ya tenés ${tope} actividades propias activas o pendientes — archivá una para crear otra`,
      409,
      { tope }
    );
  }
}

export class PropuestaNoEncontradaException extends DomainException {
  constructor() {
    super('PROPUESTA_NO_ENCONTRADA', 'La propuesta de actividad no existe', 404);
  }
}

export class PropuestaYaResueltaException extends DomainException {
  constructor() {
    super('PROPUESTA_YA_RESUELTA', 'La propuesta ya fue aprobada o rechazada', 409);
  }
}

export class AutorYaNoEstaEnElGrupoException extends DomainException {
  constructor() {
    super(
      'AUTOR_YA_NO_ESTA_EN_EL_GRUPO',
      'El integrante que propuso la actividad ya no pertenece al grupo — solo se puede rechazar',
      409
    );
  }
}

// --- Plan del día (fase-14-17) ---

export class PlanDelDiaInactivoException extends DomainException {
  constructor() {
    super(
      'PLAN_DEL_DIA_INACTIVO',
      'El grupo no usa el plan del día — todas las actividades ya se ven en la lista',
      400
    );
  }
}

export class ActividadNoElegibleParaElPlanException extends DomainException {
  constructor() {
    super(
      'ACTIVIDAD_NO_ELEGIBLE_PARA_EL_PLAN',
      'Esta actividad no se elige: ya aparece siempre en tu lista',
      400
    );
  }
}

export class ActividadYaEmpezadaException extends DomainException {
  constructor() {
    super(
      'ACTIVIDAD_YA_EMPEZADA',
      'Ya empezaste esta actividad hoy — no se puede sacar del plan del día',
      409
    );
  }
}

export class ActividadPersonalDeOtroUsuarioException extends DomainException {
  constructor() {
    super(
      'ACTIVIDAD_PERSONAL_DE_OTRO_USUARIO',
      'La actividad es personal de otro integrante — solo su autor la completa',
      403
    );
  }
}
