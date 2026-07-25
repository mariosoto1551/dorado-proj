import type {
  GrupoDto,
  InvitacionDto,
  OrganizacionDto,
  PlatformAdminDto,
  TutorDto,
  UsuarioDto,
} from '@dorado/shared-types';

import type {
  Grupo,
  Invitacion,
  Organizacion,
  PlatformAdmin,
  Tutor,
  Usuario,
} from '../generated/prisma/client';

// Mapeadores modelo Prisma -> DTO público (docs/architecture/shared-types.md).
// El modelo interno puede tener columnas que NUNCA viajan en un DTO
// (`passwordHash` es el caso obvio) — por eso el mapeo es explícito, no spread.

export function organizacionADto(organizacion: Organizacion): OrganizacionDto {
  return {
    id: organizacion.id,
    nombre: organizacion.nombre,
    emailContacto: organizacion.emailContacto,
    estado: organizacion.estado as OrganizacionDto['estado'],
    createdAt: organizacion.createdAt.toISOString(),
  };
}

export function platformAdminADto(admin: PlatformAdmin): PlatformAdminDto {
  return {
    id: admin.id,
    email: admin.email,
    nombre: admin.nombre,
    estado: admin.estado as PlatformAdminDto['estado'],
    createdAt: admin.createdAt.toISOString(),
  };
}

export function grupoADto(grupo: Grupo): GrupoDto {
  return {
    id: grupo.id,
    organizacionId: grupo.organizacionId,
    nombre: grupo.nombre,
    timezone: grupo.timezone,
    createdAt: grupo.createdAt.toISOString(),
  };
}

export function tutorADto(tutor: Tutor, grupoIds: string[]): TutorDto {
  return {
    id: tutor.id,
    organizacionId: tutor.organizacionId,
    email: tutor.email,
    nombre: tutor.nombre,
    rol: tutor.rol as TutorDto['rol'],
    grupoIds,
    estado: tutor.estado as TutorDto['estado'],
    createdAt: tutor.createdAt.toISOString(),
  };
}

/**
 * `grupoIdContexto` (fase-14, usuario multi-grupo): cuando el usuario se lista
 * dentro de un grupo puntual, el DTO refleja ESE grupo, no necesariamente el de
 * origen. Sin contexto cae al grupo de origen (compat con llamadas por id).
 */
export function usuarioADto(usuario: Usuario, grupoIdContexto?: string): UsuarioDto {
  return {
    id: usuario.id,
    organizacionId: usuario.organizacionId,
    grupoId: grupoIdContexto ?? usuario.grupoId,
    username: usuario.username,
    nombre: usuario.nombre,
    avatarId: usuario.avatarId,
    estado: usuario.estado as UsuarioDto['estado'],
    createdAt: usuario.createdAt.toISOString(),
  };
}

export function invitacionADto(invitacion: Invitacion): InvitacionDto {
  return {
    id: invitacion.id,
    organizacionId: invitacion.organizacionId,
    grupoId: invitacion.grupoId,
    tipoInvitado: invitacion.tipoInvitado as InvitacionDto['tipoInvitado'],
    codigo: invitacion.codigo,
    estado: invitacion.estado as InvitacionDto['estado'],
    expiraEn: invitacion.expiraEn.toISOString(),
    creadoPorTutorId: invitacion.creadoPorTutorId,
  };
}
