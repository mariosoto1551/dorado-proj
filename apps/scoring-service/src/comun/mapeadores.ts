import type {
  DescalificacionDto,
  EventoPuntosDto,
  PrincipalType,
  TipoOrigenPuntos,
  UmbralZonaDto,
} from '@dorado/shared-types';

import type {
  DescalificacionSeccion,
  EventoPuntos,
  ResultadoSeccion,
  UmbralZona,
} from '../generated/prisma/client';

// Mapeadores modelo Prisma -> DTO público (docs/architecture/shared-types.md).
// Mapeo explícito, no spread: el modelo interno puede tener columnas que no
// viajan en un DTO (acá: motivoCorreccion, createdAt/updatedAt de umbrales).

export function umbralADto(umbral: UmbralZona): UmbralZonaDto {
  return {
    id: umbral.id,
    organizacionId: umbral.organizacionId,
    grupoId: umbral.grupoId,
    nombreZona: umbral.nombreZona,
    orden: umbral.orden,
    puntosMin: umbral.puntosMin,
    puntosMax: umbral.puntosMax,
    colorHex: umbral.colorHex,
  };
}

export function eventoPuntosADto(evento: EventoPuntos): EventoPuntosDto {
  return {
    id: evento.id,
    organizacionId: evento.organizacionId,
    grupoId: evento.grupoId,
    usuarioId: evento.usuarioId,
    seccionId: evento.seccionId,
    sesionId: evento.sesionId,
    tipoOrigen: evento.tipoOrigen as TipoOrigenPuntos,
    origenId: evento.origenId,
    puntosSnapshot: evento.puntosSnapshot,
    registradoPorId: evento.registradoPorId,
    registradoPorTipo: evento.registradoPorTipo as PrincipalType,
    corregidoDeId: evento.corregidoDeId,
    createdAt: evento.createdAt.toISOString(),
  };
}

export function descalificacionADto(fila: DescalificacionSeccion): DescalificacionDto {
  return {
    id: fila.id,
    organizacionId: fila.organizacionId,
    grupoId: fila.grupoId,
    usuarioId: fila.usuarioId,
    seccionId: fila.seccionId,
    motivo: fila.motivo,
    registradaPorTutorId: fila.registradaPorTutorId,
    createdAt: fila.createdAt.toISOString(),
  };
}

/**
 * Shape del interno `.../resultado` (Rewards, Fase 8) — shared-types.md no
 * define DTO para ResultadoSeccion; se expone el snapshot completo.
 */
export interface ResultadoSeccionResponse {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  seccionId: string;
  puntajeTotal: number;
  umbralZonaId: string | null;
  nombreZona: string | null;
  descalificado: boolean;
  calculadoEn: string;
}

export function resultadoAResponse(resultado: ResultadoSeccion): ResultadoSeccionResponse {
  return {
    id: resultado.id,
    organizacionId: resultado.organizacionId,
    grupoId: resultado.grupoId,
    usuarioId: resultado.usuarioId,
    seccionId: resultado.seccionId,
    puntajeTotal: resultado.puntajeTotal,
    umbralZonaId: resultado.umbralZonaId,
    nombreZona: resultado.nombreZona,
    descalificado: resultado.descalificado,
    calculadoEn: resultado.calculadoEn.toISOString(),
  };
}
