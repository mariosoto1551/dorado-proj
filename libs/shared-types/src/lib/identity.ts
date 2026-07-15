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
