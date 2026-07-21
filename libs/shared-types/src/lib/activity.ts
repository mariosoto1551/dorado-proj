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
