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
  /**
   * Rol funcional dentro del grupo de `grupoId` (fase-14-19). Solo viaja cuando
   * el DTO se pide en contexto de un grupo — es un dato POR GRUPO, igual que
   * `grupoId`. `null` = sin rol, que es el default de todo participante.
   */
  rolGrupo?: RolGrupoEtiquetaDto | null;
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
  /**
   * fase-14-19: rol funcional en el grupo (`RolGrupo`), para el chip junto al
   * nombre. Ojo con la vecindad: `rol` de arriba es JEFE/MIEMBRO del equipo,
   * esto es "cocina"/"mascotas". Son dos cosas distintas.
   */
  rolGrupo?: RolGrupoEtiquetaDto | null;
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

// --- Roles del participante dentro del Grupo (fase-14-19) ---
//
// OJO con el nombre: `RolGrupo` NO es el `Rol` de plataforma de auth.ts
// (TUTOR/USUARIO/ORG_ADMIN/PLATFORM_ADMIN). Esto es una etiqueta funcional que
// define el Tutor de cada grupo ("cocina", "mascotas") y que sirve para
// restringir qué actividades ve cada participante. Nunca abreviar a `Rol`.

/** Forma mínima para pintar el chip junto al nombre del participante. */
export interface RolGrupoEtiquetaDto {
  id: string;
  nombre: string;
  /** "#RRGGBB" — el frontend NUNCA lo hardcodea, lo lee de acá. */
  colorHex: string;
}

export interface RolGrupoDto extends RolGrupoEtiquetaDto {
  grupoId: string;
  estado: 'ACTIVO' | 'INACTIVO';
  /** Cuántos participantes lo tienen asignado. Solo para TUTOR/ORG_ADMIN. */
  cantidadAsignados?: number;
  createdAt: string;
}

export interface CrearRolGrupoRequest {
  nombre: string;
  colorHex: string;
}

export type CrearRolGrupoResponse = RolGrupoDto;

export interface ActualizarRolGrupoRequest {
  nombre?: string;
  colorHex?: string;
  /** INACTIVO = archivado; archivar DESASIGNA a todos sus participantes. */
  estado?: 'ACTIVO' | 'INACTIVO';
}

/** `null` quita el rol. Un participante tiene un solo rol por grupo. */
export interface AsignarRolGrupoRequest {
  rolGrupoId: string | null;
}

/**
 * Catálogo de roles de un grupo por REST interno (fase-14-19): lo consume
 * activity para validar `Actividad.rolesPermitidos` al crear/editar. Incluye
 * archivados — un registro viejo igual tiene que poder mostrar el nombre.
 */
export interface RolGrupoInternoDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  colorHex: string;
  estado: 'ACTIVO' | 'INACTIVO';
}

/**
 * Quién tiene qué rol en un grupo (fase-14-19). Es el payload que entra al
 * camino caliente (`mi-estado-hoy`, plan del día, registro, cierre de sesión),
 * así que se mantiene deliberadamente mínimo: dos ids por participante.
 */
export interface RolAsignadoDto {
  usuarioId: string;
  rolGrupoId: string | null;
}
