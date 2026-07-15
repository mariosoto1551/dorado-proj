export enum EstadoSesion {
  ABIERTA = 'ABIERTA',
  CERRADA = 'CERRADA',
}

export enum EstadoSeccion {
  ABIERTA = 'ABIERTA',
  EVALUACION = 'EVALUACION',
  CERRADA = 'CERRADA',
}

export enum ModoSesion {
  MANUAL = 'MANUAL',
  AUTOMATICO = 'AUTOMATICO',
}

export enum EvaluarUmbralesEn {
  CADA_SESION = 'CADA_SESION',
  SOLO_AL_CIERRE_SECCION = 'SOLO_AL_CIERRE_SECCION',
}

export interface ConfiguracionSesionDto {
  grupoId: string;
  modo: ModoSesion;
  cronSesion: string | null;
  sesionesPorSeccion: number;
  cronCierreSeccion: string | null;
  evaluarUmbralesEn: EvaluarUmbralesEn;
}

export interface SeccionDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  numero: number;
  estado: EstadoSeccion;
  fechaInicio: string;
  fechaFin: string | null;
}

export interface SesionDto {
  id: string;
  seccionId: string;
  organizacionId: string;
  grupoId: string;
  numero: number;
  estado: EstadoSesion;
  fechaInicio: string;
  fechaFin: string | null;
}
