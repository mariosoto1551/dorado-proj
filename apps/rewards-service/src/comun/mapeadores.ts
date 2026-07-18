import type {
  CanjeRecompensaDto,
  EstadoCanje,
  MecanicaRecompensa,
  RecompensaDto,
} from '@dorado/shared-types';

import type { CanjeRecompensa, Recompensa } from '../generated/prisma/client';

// Mapeadores modelo Prisma -> DTO público (docs/architecture/shared-types.md).
// Mapeo explícito, no spread: el modelo interno puede tener columnas que no
// viajan en un DTO (acá: creadaPorTutorId, createdAt/updatedAt).

export function recompensaADto(recompensa: Recompensa): RecompensaDto {
  return {
    id: recompensa.id,
    organizacionId: recompensa.organizacionId,
    grupoId: recompensa.grupoId,
    nombre: recompensa.nombre,
    descripcion: recompensa.descripcion,
    imagenUrl: recompensa.imagenUrl,
    umbralZonaId: recompensa.umbralZonaId,
    nombreZonaSnapshot: recompensa.nombreZonaSnapshot,
    permiteSeleccion: recompensa.permiteSeleccion,
    permiteAzar: recompensa.permiteAzar,
    estado: recompensa.estado,
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
