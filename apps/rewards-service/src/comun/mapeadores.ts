import type {
  CanjeRecompensaDto,
  CastigoAsignadoDto,
  EstadoCanje,
  EtiquetaCatalogoDto,
  MecanicaRecompensa,
  RecompensaDto,
  TipoItemCatalogo,
} from '@dorado/shared-types';

import type {
  CanjeRecompensa,
  CastigoAsignado,
  EtiquetaCatalogo,
  Recompensa,
} from '../generated/prisma/client';

// Mapeadores modelo Prisma -> DTO público (docs/architecture/shared-types.md).
// Mapeo explícito, no spread: el modelo interno puede tener columnas que no
// viajan en un DTO (acá: creadaPorTutorId, createdAt/updatedAt).

export function etiquetaADto(etiqueta: EtiquetaCatalogo): EtiquetaCatalogoDto {
  return {
    id: etiqueta.id,
    organizacionId: etiqueta.organizacionId,
    grupoId: etiqueta.grupoId,
    nombre: etiqueta.nombre,
    colorHex: etiqueta.colorHex,
    estado: etiqueta.estado,
  };
}

/**
 * fase-14-26: las etiquetas llegan **resueltas de afuera** en vez de leerse
 * acá. Es lo que permite que el mismo mapeador sirva para el Tutor (con chips)
 * y para el participante (siempre `[]`, decisión 12) sin que el mapeador tenga
 * que conocer el rol de quien pregunta.
 */
export function recompensaADto(
  recompensa: Recompensa,
  etiquetas: EtiquetaCatalogoDto[] = []
): RecompensaDto {
  return {
    id: recompensa.id,
    organizacionId: recompensa.organizacionId,
    grupoId: recompensa.grupoId,
    nombre: recompensa.nombre,
    descripcion: recompensa.descripcion,
    imagenUrl: recompensa.imagenUrl,
    tipo: recompensa.tipo as TipoItemCatalogo,
    umbralZonaId: recompensa.umbralZonaId,
    nombreZonaSnapshot: recompensa.nombreZonaSnapshot,
    permiteSeleccion: recompensa.permiteSeleccion,
    permiteAzar: recompensa.permiteAzar,
    estado: recompensa.estado,
    etiquetas,
  };
}

export function castigoADto(castigo: CastigoAsignado): CastigoAsignadoDto {
  return {
    id: castigo.id,
    organizacionId: castigo.organizacionId,
    grupoId: castigo.grupoId,
    usuarioId: castigo.usuarioId,
    seccionId: castigo.seccionId,
    recompensaId: castigo.recompensaId,
    nombreRecompensaSnapshot: castigo.nombreRecompensaSnapshot,
    deudaSaldada: castigo.deudaSaldada,
    estado: castigo.estado as EstadoCanje,
    entregadaPorTutorId: castigo.entregadaPorTutorId,
    entregadaEn: castigo.entregadaEn ? castigo.entregadaEn.toISOString() : null,
    anuladoEn: castigo.anuladoEn ? castigo.anuladoEn.toISOString() : null,
    anuladoPorTutorId: castigo.anuladoPorTutorId,
    motivoAnulacion: castigo.motivoAnulacion,
  };
}

export function canjeADto(canje: CanjeRecompensa): CanjeRecompensaDto {
  return {
    id: canje.id,
    organizacionId: canje.organizacionId,
    grupoId: canje.grupoId,
    usuarioId: canje.usuarioId,
    seccionId: canje.seccionId,
    recompensaId: canje.recompensaId,
    mecanica: canje.mecanica as MecanicaRecompensa,
    estado: canje.estado as EstadoCanje,
    entregadaPorTutorId: canje.entregadaPorTutorId,
    entregadaEn: canje.entregadaEn ? canje.entregadaEn.toISOString() : null,
  };
}
