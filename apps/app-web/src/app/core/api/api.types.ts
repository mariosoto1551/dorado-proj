/**
 * Tipos de request/response que el backend define en sus DTOs pero que NO
 * están en @dorado/shared-types (los Request de escritura y algunos shapes
 * compuestos). Se replican acá, calcados de los DTOs de cada servicio, para
 * tipar los servicios de API de app-web. Si un contrato cambia en el backend,
 * se actualiza acá también.
 */
import type {
  AlcanceActividad,
  ComportamientoAlCierre,
  EstadoSeccion,
  EvaluarUmbralesEn,
  ModoSesion,
  RecompensaDto,
  SeccionDto,
  SesionDto,
  TipoConducta,
  TipoInvitado,
  TipoLimiteTiempo,
  TipoPuntaje,
  TipoRegistroHistorial,
} from '@dorado/shared-types';

// ---- Paginación (shape común de notification/audit, ver fase-09) ----
export interface PaginadoResponse<T> {
  items: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

// ---- Identity ----
export interface CrearGrupoRequest {
  nombre: string;
  timezone: string;
}

export interface EditarGrupoRequest {
  nombre?: string;
  timezone?: string;
}

export interface CrearInvitacionRequest {
  tipoInvitado: TipoInvitado;
}

export interface EditarUsuarioRequest {
  nombre?: string;
  avatarId?: string;
}

// ---- Activity ----
export interface CrearActividadRequest {
  nombre: string;
  descripcion?: string | null;
  tipoPuntaje: TipoPuntaje;
  valorPuntos: number;
  tipoLimiteTiempo: TipoLimiteTiempo;
  deadlineHora?: string | null;
  duracionCronometroMinutos?: number | null;
  repeticionesMaximasSesion?: number;
  repeticionesMaximasSeccion?: number | null;
  comportamientoAlCierre?: ComportamientoAlCierre;
  alcance?: AlcanceActividad;
  bonoJefePuntos?: number;
  /** fase-14-11: días en que se puede hacer (0=domingo…6=sábado); vacío = todos. */
  diasSemana?: number[];
  /** fase-14-17: la opcional se ve siempre, sin que el integrante la elija. */
  siempreVisible?: boolean;
}

export type EditarActividadRequest = Partial<CrearActividadRequest>;

export interface CrearConductaRequest {
  nombre: string;
  tipo: TipoConducta;
  valorPuntos: number;
  permiteAutoreporte?: boolean;
}

export type EditarConductaRequest = Partial<CrearConductaRequest>;

export interface IniciarCronometroResponse {
  actividadId: string;
  sesionId: string;
  iniciadoEn: string;
  venceEn: string;
}

/** Query del historial de la sesión (fase-14-18). Todo opcional. */
export interface FiltrosHistorial {
  usuarioId?: string;
  tipo?: TipoRegistroHistorial;
  /** `false` esconde lo anulado; el default del servidor es mostrarlo. */
  incluirAnulados?: boolean;
  cursor?: string;
  limite?: number;
}

// ---- Session ----
export interface GuardarConfiguracionRequest {
  modo: ModoSesion;
  cronSesion?: string | null;
  sesionesPorSeccion?: number;
  cronCierreSeccion?: string | null;
  evaluarUmbralesEn?: EvaluarUmbralesEn;
}

export interface SeccionConSesionesResponse extends SeccionDto {
  sesiones: SesionDto[];
}

export interface ExtenderSesionRequest {
  minutosAdicionales: number;
}

// ---- Scoring ----
export interface CrearUmbralRequest {
  nombreZona: string;
  orden: number;
  puntosMin: number;
  puntosMax?: number | null;
  colorHex: string;
}

export type EditarUmbralRequest = Partial<CrearUmbralRequest>;

export interface DescalificarUsuarioRequest {
  motivo: string;
}

export interface CorregirEventoPuntosRequest {
  motivo: string;
  puntosAjuste: number;
}

// ---- Rewards ----
export interface CrearRecompensaRequest {
  umbralZonaId: string;
  nombre: string;
  descripcion?: string | null;
  imagenUrl?: string | null;
  permiteSeleccion?: boolean;
  permiteAzar?: boolean;
}

export type EditarRecompensaRequest = Partial<CrearRecompensaRequest>;

export interface SeleccionarRecompensaRequest {
  recompensaId: string;
}

export type MotivoSinElegibles = 'SECCION_NO_EVALUADA' | 'DESCALIFICADO' | 'SIN_ZONA';

export interface ElegiblesResponse {
  motivo: MotivoSinElegibles | null;
  disponiblesSeleccion: RecompensaDto[];
  disponiblesAzar: RecompensaDto[];
}

// Filtros de query reutilizados
export interface FiltroEstadoCatalogo {
  estado?: 'ACTIVA' | 'ARCHIVADA';
}

export interface FiltroSecciones {
  estado?: EstadoSeccion;
}
