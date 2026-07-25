import { Rol } from './auth';

export enum EstadoOrganizacion {
  ACTIVA = 'ACTIVA',
  SUSPENDIDA = 'SUSPENDIDA',
}

export enum EstadoInvitacion {
  PENDIENTE = 'PENDIENTE',
  CANJEADA = 'CANJEADA',
  EXPIRADA = 'EXPIRADA',
  REVOCADA = 'REVOCADA',
}

export enum TipoInvitado {
  TUTOR = 'TUTOR',
  USUARIO = 'USUARIO',
}

export interface OrganizacionDto {
  id: string;
  nombre: string;
  emailContacto: string;
  estado: EstadoOrganizacion;
  createdAt: string;
}

export interface GrupoDto {
  id: string;
  organizacionId: string;
  nombre: string;
  timezone: string;
  createdAt: string;
}

export interface TutorDto {
  id: string;
  organizacionId: string;
  email: string;
  nombre: string;
  rol: Rol.ORG_ADMIN | Rol.TUTOR;
  grupoIds: string[];
  estado: 'ACTIVO' | 'INACTIVO';
  createdAt: string;
}

export interface UsuarioDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  username: string;
  nombre: string;
  avatarId: string;
  estado: 'ACTIVO' | 'INACTIVO';
  createdAt: string;
}

export interface InvitacionDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  tipoInvitado: TipoInvitado;
  codigo: string;
  estado: EstadoInvitacion;
  expiraEn: string;
  creadoPorTutorId: string;
}

// --- Equipos de trabajo (fase-14-09) ---

export enum RolEquipoMiembro {
  JEFE = 'JEFE',
  MIEMBRO = 'MIEMBRO',
}

export interface EquipoMiembroDto {
  usuarioId: string;
  nombre: string;
  avatarId: string;
  rol: RolEquipoMiembro;
}

export interface EquipoDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  estado: 'ACTIVO' | 'INACTIVO';
  jefeUsuarioId: string;
  miembros: EquipoMiembroDto[];
  createdAt: string;
}

/** Vista del equipo para el participante (fase-14-09): su equipo del grupo activo. */
export interface MiEquipoDto extends EquipoDto {
  /** true si el participante que consulta es el jefe del equipo. */
  esJefe: boolean;
}

export interface CrearEquipoRequest {
  nombre: string;
  jefeUsuarioId: string;
  /** ids de los integrantes NO-jefe; el jefe se suma aparte. */
  miembrosIds: string[];
}

export interface EditarEquipoRequest {
  nombre?: string;
  estado?: 'ACTIVO' | 'INACTIVO';
}

export interface AgregarMiembroEquipoRequest {
  usuarioId: string;
}

export interface SustituirJefeEquipoRequest {
  nuevoJefeUsuarioId: string;
}

/**
 * Resolución interna de un Equipo (fase-14-09): la consumen activity y scoring
 * (REST interno, x-internal-secret) para saber la membresía y el jefe al
 * completar una tarea de equipo o registrar un reporte.
 */
export interface EquipoInternoDto {
  equipoId: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  estado: 'ACTIVO' | 'INACTIVO';
  jefeUsuarioId: string;
  miembros: Array<{ usuarioId: string; rol: RolEquipoMiembro }>;
}
