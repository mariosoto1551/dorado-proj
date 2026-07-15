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
