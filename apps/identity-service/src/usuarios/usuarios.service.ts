import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrincipalType, Rol, TenantContext, UsuarioDto } from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { usuarioADto } from '../comun/mapeadores';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Usuario } from '../generated/prisma/client';
import { EstadoCuenta } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { EditarUsuarioRequest } from './dto/usuarios.dto';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accesoGrupo: AccesoGrupoService,
    private readonly eventos: EventosPublisherService
  ) {}

  async listarPorGrupo(tenant: TenantContext, grupoId: string): Promise<UsuarioDto[]> {
    await this.accesoGrupo.asegurarAcceso(tenant, grupoId);

    const usuarios = await this.prisma.client.usuario.findMany({
      where: { grupoId },
      orderBy: { createdAt: 'asc' },
    });

    return usuarios.map(usuarioADto);
  }

  /**
   * Editar nombre/avatarId. Permisos (spec): el propio Usuario, un TUTOR de su
   * grupo, o el ORG_ADMIN de su organización.
   */
  async editar(
    tenant: TenantContext,
    usuarioId: string,
    datos: EditarUsuarioRequest
  ): Promise<UsuarioDto> {
    const usuario = await this.obtenerUsuario(tenant, usuarioId);

    await this.asegurarPuedeGestionar({ tenant, usuario, permitirPropio: true });

    await this.prisma.client.usuario.updateMany({
      where: { id: usuario.id },
      data: {
        ...(datos.nombre !== undefined && { nombre: datos.nombre }),
        ...(datos.avatarId !== undefined && { avatarId: datos.avatarId }),
      },
    });

    const actualizado = await this.prisma.client.usuario.findFirst({
      where: { id: usuario.id },
    });

    return usuarioADto(actualizado ?? usuario);
  }

  /**
   * Soft delete (spec): marca estado=INACTIVO, NUNCA borra la fila — el
   * historial de puntaje de otros servicios referencia este id.
   */
  async desactivar(tenant: TenantContext, usuarioId: string): Promise<void> {
    const usuario = await this.obtenerUsuario(tenant, usuarioId);

    await this.asegurarPuedeGestionar({ tenant, usuario, permitirPropio: false });

    await this.prisma.client.usuario.updateMany({
      where: { id: usuario.id },
      data: { estado: EstadoCuenta.INACTIVO },
    });

    // Retrofit fase-09: rastro de auditoría de toda escritura administrativa.
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: usuario.organizacionId,
      grupoId: usuario.grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion: 'USUARIO_DESACTIVADO',
      entidadTipo: 'Usuario',
      entidadId: usuario.id,
      detalle: { nombre: usuario.nombre, estadoAnterior: usuario.estado },
    });
  }

  private async obtenerUsuario(tenant: TenantContext, usuarioId: string): Promise<Usuario> {
    const usuario = await this.prisma.client.usuario.findFirst({
      where: { id: usuarioId },
    });

    if (!usuario || usuario.organizacionId !== tenant.organizacionId) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return usuario;
  }

  private async asegurarPuedeGestionar(params: {
    tenant: TenantContext;
    usuario: Usuario;
    permitirPropio: boolean;
  }): Promise<void> {
    const { tenant, usuario, permitirPropio } = params;

    if (tenant.rol === Rol.ORG_ADMIN) {
      return;
    }

    if (tenant.principalType === PrincipalType.USUARIO) {
      if (permitirPropio && tenant.principalId === usuario.id) {
        return;
      }

      throw new ForbiddenException('Un usuario solo puede editar su propio perfil');
    }

    // TUTOR: debe estar asignado al grupo del usuario (fuente de verdad: la base).
    const asignacion = await this.prisma.client.tutorGrupo.findFirst({
      where: { tutorId: tenant.principalId, grupoId: usuario.grupoId },
    });

    if (!asignacion) {
      throw new ForbiddenException('No estás asignado al grupo de este usuario');
    }
  }
}
