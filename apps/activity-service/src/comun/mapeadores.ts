import type {
  ActividadDto,
  AlcanceActividad,
  ComportamientoAlCierre,
  ConductaDto,
  EstadoPropuesta,
  EstadoReporte,
  ModoCreacionContenidoUsuario,
  OrigenActividad,
  PrincipalType,
  PropuestaActividadDto,
  RegistroActividadDto,
  RegistroConductaDto,
  ReporteMiembroDto,
  TipoConducta,
  TipoLimiteTiempo,
  TipoPuntaje,
} from '@dorado/shared-types';

import type {
  Actividad,
  Conducta,
  PropuestaActividad,
  RegistroActividad,
  RegistroConducta,
  ReporteMiembro,
} from '../generated/prisma/client';

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
    // fase-14-20: 0 salvo en una OBLIGATORIA confirmable con premio cargado.
    puntosPorCumplir: actividad.puntosPorCumplir,
    tipoLimiteTiempo: actividad.tipoLimiteTiempo as TipoLimiteTiempo,
    deadlineHora: actividad.deadlineHora,
    duracionCronometroMinutos: actividad.duracionCronometroMinutos,
    repeticionesMaximasSesion: actividad.repeticionesMaximasSesion,
    // fase-14-25: 1 salvo en una OBLIGATORIA confirmable con mínimo cargado.
    repeticionesMinimasSesion: actividad.repeticionesMinimasSesion,
    repeticionesMaximasSeccion: actividad.repeticionesMaximasSeccion,
    comportamientoAlCierre: actividad.comportamientoAlCierre as ComportamientoAlCierre,
    alcance: actividad.alcance as AlcanceActividad,
    bonoJefePuntos: actividad.bonoJefePuntos,
    origen: actividad.origen as OrigenActividad,
    creadaPorUsuarioId: actividad.creadaPorUsuarioId,
    diasSemana: actividad.diasSemana,
    siempreVisible: actividad.siempreVisible,
    rolesPermitidos: actividad.rolesPermitidos,
    usuariosPermitidos: actividad.usuariosPermitidos,
    equiposPermitidos: actividad.equiposPermitidos,
    vigenteDesde: actividad.vigenteDesde,
    vigenteHasta: actividad.vigenteHasta,
    estado: actividad.estado,
  };
}

/** fase-14-10: propuesta de actividad de un integrante (objeto de workflow). */
export function propuestaActividadADto(
  propuesta: PropuestaActividad
): PropuestaActividadDto {
  return {
    id: propuesta.id,
    organizacionId: propuesta.organizacionId,
    grupoId: propuesta.grupoId,
    creadaPorUsuarioId: propuesta.creadaPorUsuarioId,
    nombre: propuesta.nombre,
    descripcion: propuesta.descripcion,
    valorPuntos: propuesta.valorPuntos,
    repeticionesMaximasSesion: propuesta.repeticionesMaximasSesion,
    estado: propuesta.estado as EstadoPropuesta,
    modoAlCrear: propuesta.modoAlCrear as ModoCreacionContenidoUsuario,
    resueltoPorId: propuesta.resueltoPorId,
    resueltoPorTipo: propuesta.resueltoPorTipo,
    motivoRechazo: propuesta.motivoRechazo,
    actividadId: propuesta.actividadId,
    createdAt: propuesta.createdAt.toISOString(),
  };
}

export function reporteMiembroADto(reporte: ReporteMiembro): ReporteMiembroDto {
  return {
    id: reporte.id,
    organizacionId: reporte.organizacionId,
    grupoId: reporte.grupoId,
    equipoId: reporte.equipoId,
    reportadoUsuarioId: reporte.reportadoUsuarioId,
    jefeUsuarioId: reporte.jefeUsuarioId,
    conductaId: reporte.conductaId,
    motivo: reporte.motivo,
    estado: reporte.estado as EstadoReporte,
    resueltoPorTutorId: reporte.resueltoPorTutorId,
    registroConductaId: reporte.registroConductaId,
    createdAt: reporte.createdAt.toISOString(),
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

export function registroActividadADto(registro: RegistroActividad): RegistroActividadDto {
  return {
    id: registro.id,
    organizacionId: registro.organizacionId,
    grupoId: registro.grupoId,
    usuarioId: registro.usuarioId,
    actividadId: registro.actividadId,
    sesionId: registro.sesionId,
    seccionId: registro.seccionId,
    tipo: registro.tipo,
    valorPuntosSnapshot: registro.valorPuntosSnapshot,
    registradoPorId: registro.registradoPorId,
    registradoPorTipo: registro.registradoPorTipo as PrincipalType,
    eliminado: registro.eliminado,
    motivoTutor: registro.motivoTutor,
    // fase-14-33: null = se cargó en su día (todo lo anterior a ese ítem).
    cargadoRetroactivamenteEn: registro.cargadoRetroactivamenteEn?.toISOString() ?? null,
    motivoRetroactivo: registro.motivoRetroactivo,
    motivoReversion: registro.motivoReversion,
    createdAt: registro.createdAt.toISOString(),
  };
}

export function registroConductaADto(registro: RegistroConducta): RegistroConductaDto {
  return {
    id: registro.id,
    organizacionId: registro.organizacionId,
    grupoId: registro.grupoId,
    usuarioId: registro.usuarioId,
    conductaId: registro.conductaId,
    sesionId: registro.sesionId,
    seccionId: registro.seccionId,
    valorPuntosSnapshot: registro.valorPuntosSnapshot,
    registradoPorId: registro.registradoPorId,
    registradoPorTipo: registro.registradoPorTipo as PrincipalType,
    eliminado: registro.eliminado,
    // fase-14-33: ver `registroActividadADto`.
    cargadoRetroactivamenteEn: registro.cargadoRetroactivamenteEn?.toISOString() ?? null,
    motivoRetroactivo: registro.motivoRetroactivo,
    createdAt: registro.createdAt.toISOString(),
  };
}
