import { PrincipalType } from './auth';

export enum TipoOrigenPuntos {
  ACTIVIDAD_COMPLETADA = 'ACTIVIDAD_COMPLETADA',
  NO_HIZO = 'NO_HIZO',
  CONDUCTA = 'CONDUCTA',
  CORRECCION = 'CORRECCION',
}

export interface EventoPuntosDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  seccionId: string;
  sesionId: string;
  tipoOrigen: TipoOrigenPuntos;
  origenId: string;
  puntosSnapshot: number;
  registradoPorId: string;
  registradoPorTipo: PrincipalType;
  corregidoDeId: string | null;
  createdAt: string;
}

export interface UmbralZonaDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombreZona: string;
  orden: number;
  puntosMin: number;
  puntosMax: number | null;
  colorHex: string;
}

export interface PuntajeUsuarioDto {
  usuarioId: string;
  seccionId: string;
  puntajeTotal: number;
  zona: UmbralZonaDto | null;
  descalificado: boolean;
}

/**
 * Config de scoring por Grupo (fase-14). `puntosIniciales` es la base con la
 * que cada usuario arranca en CADA Sección — se suma al derivar el puntaje.
 * La configura el admin del grupo; 0 = arrancar en cero (histórico).
 */
export interface ConfiguracionScoringGrupoDto {
  puntosIniciales: number;
}

export interface DescalificacionDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  seccionId: string;
  motivo: string;
  registradaPorTutorId: string;
  createdAt: string;
}

/**
 * Puntaje derivado de un Equipo (fase-14-09): suma de los EventoPuntos con ese
 * equipoId. Vista de solo lectura del ledger — nunca un acumulado guardado.
 */
export interface PuntajeEquipoDto {
  equipoId: string;
  /** null = todas las secciones; si viene, solo esa. */
  seccionId: string | null;
  puntajeTotal: number;
  porMiembro: Array<{ usuarioId: string; puntos: number }>;
}
