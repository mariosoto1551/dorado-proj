// Contrato del panel de PLATFORM_ADMIN — fuente: docs/phases/fase-14-05-panel-platform-admin.md.
// Estas entidades viven POR ENCIMA del tenant: no llevan organizacionId.
import { CodigoPlan, SuscripcionDto } from './billing';
import { EstadoOrganizacion, GrupoDto, OrganizacionDto } from './identity';
import { RegistroAuditoriaDto } from './notification-audit';

export interface PlatformAdminDto {
  id: string;
  email: string;
  nombre: string;
  estado: 'ACTIVO' | 'INACTIVO';
  createdAt: string;
}

// ---------- Auth de plataforma ----------
export interface AdminLoginRequest {
  email: string;
  password: string;
}

export interface AdminLoginResponse {
  accessToken: string;
  perfil: PlatformAdminDto;
}

// ---------- Gestión de organizaciones ----------
export interface AdminOrganizacionResumenDto {
  id: string;
  nombre: string;
  emailContacto: string;
  estado: EstadoOrganizacion;
  plan: CodigoPlan;
  cantidadGrupos: number;
  cantidadTutores: number;
  cantidadUsuarios: number;
  createdAt: string;
}

export interface AdminListarOrganizacionesResponse {
  items: AdminOrganizacionResumenDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminOrganizacionDetalleDto {
  organizacion: OrganizacionDto;
  plan: CodigoPlan;
  suscripcion: SuscripcionDto;
  grupos: GrupoDto[];
  cantidadTutores: number;
  cantidadUsuarios: number;
  historialAdministrativo: RegistroAuditoriaDto[];
}

export interface AdminCambiarPlanRequest {
  plan: CodigoPlan;
}

export interface AdminCambiarPlanResponse {
  suscripcion: SuscripcionDto;
}

export interface AdminCambiarEstadoOrgRequest {
  estado: EstadoOrganizacion;
}

export interface AdminCambiarEstadoOrgResponse {
  organizacion: OrganizacionDto;
}
