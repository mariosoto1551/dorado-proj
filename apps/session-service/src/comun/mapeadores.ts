import type {
  ConfiguracionSesionDto,
  EstadoSeccion,
  EstadoSesion,
  EvaluarUmbralesEn,
  ModoSesion,
  SeccionDto,
  SesionDto,
} from '@dorado/shared-types';

import type { ConfiguracionSesion, Seccion, Sesion } from '../generated/prisma/client';

// Mapeadores modelo Prisma -> DTO público (docs/architecture/shared-types.md).
// Mapeo explícito, no spread: el modelo interno puede tener columnas que no
// viajan en un DTO (acá: autocierrePospuestoHasta, createdAt, updatedAt).
//
// Ojo con ConfiguracionSesion: shared-types.md nombra los campos del DTO
// `cronSesion`/`cronCierreSeccion`, mientras que la spec fase-06 nombra las
// columnas `cronAperturaSesion`/`cronAperturaSeccion`. Ambos documentos son
// inmutables (protocolo del proyecto) — el contrato público es el de
// shared-types y el mapeo se resuelve acá. Desviación documentada en
// docs/progreso/fase-06-session-section.md.

/** Campos de ConfiguracionSesion que definen el comportamiento (sin timestamps). */
export type ConfiguracionEfectiva = Omit<ConfiguracionSesion, 'createdAt' | 'updatedAt'>;

export function configuracionADto(config: ConfiguracionEfectiva): ConfiguracionSesionDto {
  return {
    grupoId: config.grupoId,
    modo: config.modo as ModoSesion,
    cronSesion: config.cronAperturaSesion,
    sesionesPorSeccion: config.sesionesPorSeccion,
    cronCierreSeccion: config.cronAperturaSeccion,
    evaluarUmbralesEn: config.evaluarUmbralesEn as EvaluarUmbralesEn,
  };
}

export function seccionADto(seccion: Seccion): SeccionDto {
  return {
    id: seccion.id,
    organizacionId: seccion.organizacionId,
    grupoId: seccion.grupoId,
    numero: seccion.numero,
    estado: seccion.estado as EstadoSeccion,
    fechaInicio: seccion.fechaInicio.toISOString(),
    fechaFin: seccion.fechaFin ? seccion.fechaFin.toISOString() : null,
  };
}

export function sesionADto(sesion: Sesion): SesionDto {
  return {
    id: sesion.id,
    seccionId: sesion.seccionId,
    organizacionId: sesion.organizacionId,
    grupoId: sesion.grupoId,
    numero: sesion.numero,
    estado: sesion.estado as EstadoSesion,
    fechaInicio: sesion.fechaInicio.toISOString(),
    fechaFin: sesion.fechaFin ? sesion.fechaFin.toISOString() : null,
  };
}
