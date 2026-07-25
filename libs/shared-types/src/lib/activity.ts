import { PrincipalType } from './auth';

export enum TipoPuntaje {
  OPCIONAL = 'OPCIONAL',
  OBLIGATORIA = 'OBLIGATORIA',
}

export enum TipoLimiteTiempo {
  DEADLINE = 'DEADLINE',
  CRONOMETRO = 'CRONOMETRO',
  SIN_LIMITE = 'SIN_LIMITE',
}

export enum TipoConducta {
  BUENA = 'BUENA',
  MALA = 'MALA',
}

/**
 * Comportamiento de una actividad OBLIGATORIA al cerrar la Sesión (fase-14-08).
 * Solo tiene sentido con tipoPuntaje = OBLIGATORIA; para OPCIONAL se fuerza a
 * ASUME_HECHA.
 */
export enum ComportamientoAlCierre {
  /** Comportamiento clásico: sin registro positivo, sin castigo automático. */
  ASUME_HECHA = 'ASUME_HECHA',
  /** El Usuario debe confirmar; si no, no-hizo automático al cerrar la Sesión. */
  REQUIERE_CONFIRMACION = 'REQUIERE_CONFIRMACION',
}

/**
 * Alcance de una actividad (fase-14-09). INDIVIDUAL = clásico (cada usuario la
 * completa para sí). EQUIPO = la completa el jefe una vez y scoring reparte a
 * los miembros. Las de equipo son siempre OPCIONAL en esta fase.
 */
export enum AlcanceActividad {
  INDIVIDUAL = 'INDIVIDUAL',
  EQUIPO = 'EQUIPO',
}

export interface ActividadDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  descripcion: string | null;
  tipoPuntaje: TipoPuntaje;
  valorPuntos: number;
  tipoLimiteTiempo: TipoLimiteTiempo;
  deadlineHora: string | null;
  duracionCronometroMinutos: number | null;
  repeticionesMaximasSesion: number;
  repeticionesMaximasSeccion: number | null;
  comportamientoAlCierre: ComportamientoAlCierre;
  alcance: AlcanceActividad;
  /** Puntos extra al jefe sobre el valor base; solo relevante si alcance = EQUIPO. */
  bonoJefePuntos: number;
  estado: 'ACTIVA' | 'ARCHIVADA';
}

export interface ConductaDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  tipo: TipoConducta;
  valorPuntos: number;
  permiteAutoreporte: boolean;
  estado: 'ACTIVA' | 'ARCHIVADA';
}

export interface RegistroActividadDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  actividadId: string;
  sesionId: string;
  seccionId: string;
  tipo: 'COMPLETADA' | 'NO_HIZO';
  valorPuntosSnapshot: number;
  registradoPorId: string;
  registradoPorTipo: PrincipalType;
  createdAt: string;
}

export interface RegistroConductaDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  conductaId: string;
  sesionId: string;
  seccionId: string;
  valorPuntosSnapshot: number;
  registradoPorId: string;
  registradoPorTipo: PrincipalType;
  eliminado: boolean;
  createdAt: string;
}

/**
 * Estado de una actividad ACTIVA para el Usuario en la Sesión abierta actual
 * (fase-14-08, GET /activity/grupos/:grupoId/mi-estado-hoy). Reemplaza el `Set`
 * local optimista de la home y habilita la barrita "X de N" de repeticiones.
 */
export interface MiEstadoActividadHoyDto {
  actividadId: string;
  tipoPuntaje: TipoPuntaje;
  comportamientoAlCierre: ComportamientoAlCierre;
  repeticionesMaximasSesion: number;
  /** count RegistroActividad tipo=COMPLETADA del usuario+actividad+sesión actual. */
  vecesHechas: number;
  /** Obligatoria confirmable: vecesHechas > 0. Para OPCIONAL/ASUME_HECHA: false. */
  confirmada: boolean;
}

export interface MiEstadoHoyDto {
  /** null si no hay Sesión ABIERTA (actividades queda vacío). */
  sesionId: string | null;
  actividades: MiEstadoActividadHoyDto[];
}

/** Una completada individual de un usuario, para que el tutor la pueda quitar. */
export interface RegistroCompletadaDto {
  registroId: string;
  createdAt: string;
}

/**
 * Actividades OPCIONALES que un usuario completó en la Sesión abierta (fase-14,
 * corrección del tutor). Agrupadas por actividad, con las filas individuales
 * para poder quitar una (la última) o todas. Solo completadas NO eliminadas.
 */
export interface CompletadaOpcionalDto {
  actividadId: string;
  nombre: string;
  valorPuntos: number;
  /** Ordenadas por createdAt asc; para "quitar una" se elimina la última. */
  registros: RegistroCompletadaDto[];
}

// --- Tareas de equipo y reportes del jefe (fase-14-09) ---

export enum EstadoReporte {
  PENDIENTE = 'PENDIENTE',
  APROBADO = 'APROBADO',
  RECHAZADO = 'RECHAZADO',
}

/** Reparto resuelto de una tarea de equipo (una entrada por miembro). */
export interface AsignacionPuntosEquipoDto {
  usuarioId: string;
  /** valor base + bono del jefe si corresponde. */
  puntos: number;
  esJefe: boolean;
}

export interface CompletarTareaEquipoResponse {
  registroTareaEquipoId: string;
  equipoId: string;
  actividadId: string;
  asignaciones: AsignacionPuntosEquipoDto[];
}

/**
 * Reporte del jefe de equipo contra un integrante por una conducta MALA concreta
 * del catálogo (fase-14-09). El descuento se aplica solo si el Tutor lo aprueba.
 */
export interface ReporteMiembroDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  equipoId: string;
  reportadoUsuarioId: string;
  jefeUsuarioId: string;
  conductaId: string;
  motivo: string | null;
  estado: EstadoReporte;
  resueltoPorTutorId: string | null;
  registroConductaId: string | null;
  createdAt: string;
}

export interface CrearReporteMiembroRequest {
  reportadoUsuarioId: string;
  /** conducta MALA ACTIVA del grupo. */
  conductaId: string;
  motivo?: string;
}
