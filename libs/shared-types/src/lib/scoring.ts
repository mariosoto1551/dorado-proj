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

/**
 * Puntaje de un participante dentro del resumen del Grupo (fase-14-29 tanda 3,
 * herramienta `resumen_puntajes`). Sin nombre a propósito: scoring no conoce
 * nombres y no debe salir a identity para armar esto — quien consume el
 * resumen ya tiene la lista de participantes y compone por ID (regla 2).
 */
export interface PuntajeResumidoDto {
  usuarioId: string;
  puntajeTotal: number;
  /** Nombre de la zona alcanzada, o null si ninguna matcheó / está descalificado. */
  nombreZona: string | null;
  descalificado: boolean;
}

/**
 * Foto de los puntajes del Grupo en la Sección más reciente que tenga
 * movimiento (fase-14-29). La Sección se resuelve dentro de scoring, desde su
 * propio ledger: pedírsela a session-service encadenaría un tercer servicio
 * para responder una pregunta que el ledger ya contesta.
 *
 * `seccionId` en null (y la lista vacía) significa que el Grupo todavía no
 * registró un solo punto — no es un error.
 */
export interface ResumenPuntajesGrupoDto {
  grupoId: string;
  seccionId: string | null;
  /** Si los puntajes salen del snapshot `ResultadoSeccion` (Sección ya evaluada) o del ledger en vivo. */
  origen: 'SNAPSHOT' | 'EN_VIVO';
  puntajes: PuntajeResumidoDto[];
}
