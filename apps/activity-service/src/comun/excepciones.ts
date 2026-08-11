import { DomainException } from '@dorado/shared-auth';

import { motivoNoDisponible, type ProgramacionActividad } from './programacion';

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

// Codes de escritura en una Sesión pasada (fase-14-33).

/**
 * La Sesión pedida no pertenece a la Sección vigente del Grupo.
 *
 * Un solo code para cuatro casos —no existe, es de otro Grupo, es de otra
 * organización, es de una Sección ya CERRADA— a propósito: distinguirlos le
 * diría a quien prueba ids cuál de sus intentos rozó algo real.
 */
export class SesionNoEditableException extends DomainException {
  constructor() {
    super(
      'SESION_NO_EDITABLE',
      'Esa Sesión no pertenece a la Sección vigente del grupo — una Sección cerrada no se edita',
      409
    );
  }
}

/**
 * Escribir en una Sesión que ya cerró exige decir por qué (decisión 7): una
 * fila que aparece en un día terminado, sin explicación, es exactamente lo que
 * la regla 6 del proyecto existe para evitar.
 */
export class MotivoRetroactivoRequeridoException extends DomainException {
  constructor() {
    super(
      'MOTIVO_RETROACTIVO_REQUERIDO',
      'Cargar algo en una Sesión que ya cerró exige un motivo',
      400
    );
  }
}

/**
 * Un cronómetro es un instrumento del momento presente: «empezá a contar 40
 * minutos en el martes pasado» no significa nada (decisión 3). Completar
 * retroactivamente una actividad de cronómetro sí se puede — lo que no se
 * puede es arrancarlo.
 */
export class CronometroNoRetroactivoException extends DomainException {
  constructor() {
    super(
      'CRONOMETRO_NO_RETROACTIVO',
      'Un cronómetro solo se inicia en la Sesión abierta',
      400
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

// --- Historial de la sesión (fase-14-18) ---

export class CursorHistorialInvalidoException extends DomainException {
  constructor() {
    super('CURSOR_INVALIDO', 'El cursor de paginación no es válido', 400);
  }
}

export class RegistroDelHistorialNoEncontradoException extends DomainException {
  constructor() {
    // Mismo 404 para inexistente y para "de otra organización" (no revela nada),
    // igual que el resto del servicio.
    super('REGISTRO_NO_ENCONTRADO', 'El registro no existe', 404);
  }
}

export class NotaDeOtroTutorException extends DomainException {
  constructor() {
    // La regla es de AUTORÍA, no de jerarquía: un ORG_ADMIN tampoco borra
    // notas ajenas (spec fase-14-18, decisión 7).
    super('NOTA_DE_OTRO_TUTOR', 'Solo quien escribió la nota puede borrarla', 403);
  }
}

// --- Roles del participante dentro del Grupo (fase-14-19) ---

export class ActividadNoEsDeTuRolException extends DomainException {
  constructor() {
    // La pantalla ya no la muestra (decisión 6: se oculta por completo), pero el
    // servidor es el que decide — un cliente con la lista vieja en caché no
    // puede colar el registro.
    super(
      'ACTIVIDAD_NO_ES_DE_TU_ROL',
      'Esta actividad está asignada a otro rol del grupo',
      403
    );
  }
}

export class ActividadNoEsDeSuRolException extends DomainException {
  constructor() {
    // La misma regla vista desde el Tutor: no puede registrarle un "no hizo" ni
    // una marca roja al participante por algo que para él no existe.
    super(
      'ACTIVIDAD_NO_ES_DE_SU_ROL',
      'La actividad está asignada a un rol que el participante no tiene',
      400
    );
  }
}

export class RolGrupoInexistenteException extends DomainException {
  constructor() {
    super(
      'ROL_GRUPO_INEXISTENTE',
      'Alguno de los roles indicados no está activo en este grupo',
      400
    );
  }
}

export class RestriccionRolSoloIndividualException extends DomainException {
  constructor() {
    // Decisión 10 de la spec: una tarea de equipo la completa el jefe en nombre
    // del equipo — cruzar rol funcional con membresía de equipo abre preguntas
    // que este ítem no necesita responder.
    super(
      'RESTRICCION_ROL_SOLO_INDIVIDUAL',
      'Solo una actividad individual puede restringirse por rol',
      400
    );
  }
}

export class ActividadPersonalSinRolesException extends DomainException {
  constructor() {
    // Decisión 11: su dueño ya es una sola persona, restringirla no significa nada.
    super(
      'ACTIVIDAD_PERSONAL_SIN_ROLES',
      'Una actividad personal de un integrante no se restringe por rol',
      400
    );
  }
}

// --- Turnos rotativos (fase-14-21) ---

export class TurnoSoloObligatoriaException extends DomainException {
  constructor() {
    // Decisión 11 de la spec: rotar una opcional no tiene consecuencia (nadie
    // pierde nada por no hacerla), así que la rotación no significa nada ahí.
    super('TURNO_SOLO_OBLIGATORIA', 'Solo una actividad OBLIGATORIA puede rotar por turnos', 400);
  }
}

export class TurnoSoloIndividualException extends DomainException {
  constructor() {
    // Una tarea de equipo ya tiene su jefe: cruzar las dos formas de "a quién le
    // toca" abre preguntas que este ítem no necesita responder.
    super('TURNO_SOLO_INDIVIDUAL', 'Una tarea de equipo no rota por turnos', 400);
  }
}

export class SecuenciaVaciaException extends DomainException {
  constructor() {
    super('SECUENCIA_VACIA', 'La secuencia de turnos necesita al menos un integrante', 400);
  }
}

export class TurnoNoConfiguradoException extends DomainException {
  constructor() {
    super('TURNO_NO_CONFIGURADO', 'La actividad no tiene turnos configurados', 404);
  }
}

export class UsuarioNoEsDelGrupoException extends DomainException {
  constructor() {
    // La secuencia solo admite integrantes del grupo AL GUARDAR; después pueden
    // irse, y ahí manda la decisión 14 (la lista no se edita sola, se saltea).
    super('USUARIO_NO_ES_DEL_GRUPO', 'Ese participante no pertenece a este grupo', 400);
  }
}

export class SinTurnoVigenteException extends DomainException {
  constructor() {
    // Pasa cuando la actividad no corre hoy (días programados del #11) o cuando
    // ninguna posición de la vuelta quedó válida (decisión 19).
    super('SIN_TURNO_VIGENTE', 'Hoy no hay ningún turno asignado para esta actividad', 409);
  }
}

export class NoEsTuTurnoException extends DomainException {
  constructor(nombreAsignado: string | null) {
    super(
      'NO_ES_TU_TURNO',
      nombreAsignado ? `Hoy le toca a ${nombreAsignado}` : 'Hoy no te toca esta actividad',
      403
    );
  }
}

export class NoEsSuTurnoException extends DomainException {
  constructor() {
    // La misma regla vista desde el Tutor: no puede confirmar ni castigar en
    // nombre de alguien a quien hoy no le tocaba (decisiones 6 y 17).
    super('NO_ES_SU_TURNO', 'Hoy no le toca a ese integrante', 400);
  }
}

// --- Destinatario y vigencia (fase-14-24) ---

export class DestinatarioAmbiguoException extends DomainException {
  constructor() {
    // Los cuatro modos son excluyentes (decisión 1): permitir dos a la vez
    // obligaría a fijar una semántica de cruce —¿intersección o unión?— que no
    // se puede explicar en una pantalla. El caso mixto se resuelve con el atajo
    // que precarga la lista de personas, no con una regla.
    super(
      'DESTINATARIO_AMBIGUO',
      'Una actividad tiene un solo destinatario: todo el grupo, un rol, personas o equipos',
      400
    );
  }
}

export class UsuarioFueraDelGrupoException extends DomainException {
  constructor() {
    super(
      'USUARIO_FUERA_DEL_GRUPO',
      'Alguno de los participantes indicados no pertenece a este grupo',
      400
    );
  }
}

export class EquipoFueraDelGrupoException extends DomainException {
  constructor() {
    super(
      'EQUIPO_FUERA_DEL_GRUPO',
      'Alguno de los equipos indicados no está activo en este grupo',
      400
    );
  }
}

export class DestinatarioIncompatibleConAlcanceException extends DomainException {
  constructor(mensaje: string) {
    // Decisión 5: con alcance EQUIPO el destinatario es por equipo. Asignar una
    // tarea colectiva a personas sueltas obliga a preguntarse qué pasa con los
    // otros miembros de ese equipo, y no hay respuesta buena.
    super('DESTINATARIO_INCOMPATIBLE_CON_ALCANCE', mensaje, 400);
  }
}

export class VigenciaInvalidaException extends DomainException {
  constructor(mensaje: string) {
    super('VIGENCIA_INVALIDA', mensaje, 400);
  }
}

export class ActividadFueraDeVigenciaException extends DomainException {
  constructor(vigenteDesde: string | null, vigenteHasta: string | null) {
    super(
      'ACTIVIDAD_FUERA_DE_VIGENCIA',
      'La actividad no está vigente en esta fecha',
      409,
      // Las fechas viajan en el error por el mismo motivo que los días en
      // ACTIVIDAD_NO_DISPONIBLE_HOY: que el cliente pueda decir cuáles son.
      { vigenteDesde, vigenteHasta }
    );
  }
}

export class TurnoFueraDelDestinatarioException extends DomainException {
  constructor() {
    // Decisión 6: una sola verdad sobre quién participa. Si la actividad es de
    // ciertas personas, el pozo de la rotación sale de ahí.
    super(
      'TURNO_FUERA_DEL_DESTINATARIO',
      'La secuencia de turnos solo puede incluir a los destinatarios de la actividad',
      400
    );
  }
}

/**
 * La excepción que corresponde a una actividad que hoy no corre, o `null` si sí
 * corre (fase-14-24).
 *
 * Existe para que los tres puntos que **rechazan** una escritura —completar /
 * iniciar cronómetro / no-hizo del tutor, tarea de equipo y plan del día— no
 * repitan cada uno el mismo `if` de dos ramas. El motivo importa: "todavía no
 * empezó" y "los martes" son mensajes distintos para el integrante, y el cliente
 * necesita el `code` para saber cuál mostrar.
 */
export function excepcionSiNoDisponible(
  actividad: ProgramacionActividad & { vigenteDesde: string | null; vigenteHasta: string | null },
  fechaInicioSesion: Date,
  timezone: string
): DomainException | null {
  const motivo = motivoNoDisponible(actividad, fechaInicioSesion, timezone);

  if (motivo === 'FUERA_DE_VIGENCIA') {
    return new ActividadFueraDeVigenciaException(actividad.vigenteDesde, actividad.vigenteHasta);
  }

  if (motivo === 'OTRO_DIA') {
    return new ActividadNoDisponibleHoyException(actividad.diasSemana);
  }

  return null;
}
