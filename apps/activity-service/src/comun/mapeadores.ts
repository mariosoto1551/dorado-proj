import type {
  ActividadDto,
  ConductaDto,
  TipoConducta,
  TipoLimiteTiempo,
  TipoPuntaje,
} from '@dorado/shared-types';

import type { Actividad, Conducta } from '../generated/prisma/client';

// Mapeadores modelo Prisma -> DTO público (docs/architecture/shared-types.md).
// Mapeo explícito, no spread: el modelo interno puede tener columnas que no
// viajan en un DTO (acá: creadaPorTutorId, createdAt, updatedAt).

export function actividadADto(actividad: Actividad): ActividadDto {
  return {
    id: actividad.id,
    organizacionId: actividad.organizacionId,
    grupoId: actividad.grupoId,
    nombre: actividad.nombre,
    descripcion: actividad.descripcion,
    tipoPuntaje: actividad.tipoPuntaje as TipoPuntaje,
    valorPuntos: actividad.valorPuntos,
    tipoLimiteTiempo: actividad.tipoLimiteTiempo as TipoLimiteTiempo,
    deadlineHora: actividad.deadlineHora,
    duracionCronometroMinutos: actividad.duracionCronometroMinutos,
    repeticionesMaximasSesion: actividad.repeticionesMaximasSesion,
    repeticionesMaximasSeccion: actividad.repeticionesMaximasSeccion,
    estado: actividad.estado,
  };
}

export function conductaADto(conducta: Conducta): ConductaDto {
  return {
    id: conducta.id,
    organizacionId: conducta.organizacionId,
    grupoId: conducta.grupoId,
    nombre: conducta.nombre,
    tipo: conducta.tipo as TipoConducta,
    valorPuntos: conducta.valorPuntos,
    permiteAutoreporte: conducta.permiteAutoreporte,
    estado: conducta.estado,
  };
}
