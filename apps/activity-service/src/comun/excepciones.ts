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
