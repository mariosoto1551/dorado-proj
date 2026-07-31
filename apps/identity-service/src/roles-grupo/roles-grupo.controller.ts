import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';

import { CurrentTenant, Roles, RolesGuard, TenantContextGuard } from '@dorado/shared-auth';
import { PrincipalType, Rol, RolGrupoDto, TenantContext } from '@dorado/shared-types';

import {
  ActualizarRolGrupoRequest,
  AsignarRolGrupoRequest,
  CrearRolGrupoRequest,
} from './dto/roles-grupo.dto';
import { RolesGrupoService } from './roles-grupo.service';

/**
 * Roles del participante dentro del Grupo (fase-14-19). Gestión solo para
 * TUTOR/ORG_ADMIN; el **listado** acepta además la sesión USUARIO porque el rol
 * es visible para todos dentro del grupo (decisión 5) — el participante necesita
 * el nombre y el color para pintar el chip de sus compañeros.
 *
 * `Rol` acá es el rol de PLATAFORMA; lo que administra este controller es
 * `RolGrupo`, otra cosa. Ver la nota de nomenclatura en shared-types.
 */
@Controller('identity')
@UseGuards(TenantContextGuard, RolesGuard)
@Roles(Rol.TUTOR, Rol.ORG_ADMIN)
export class RolesGrupoController {
  constructor(private readonly roles: RolesGrupoService) {}

  @Get('grupos/:grupoId/roles')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN, Rol.USUARIO)
  async listar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Query('incluirArchivados') incluirArchivados?: string
  ): Promise<RolGrupoDto[]> {
    if (tenant.principalType === PrincipalType.USUARIO) {
      return await this.roles.listarParaParticipante(tenant, grupoId);
    }

    return await this.roles.listar(tenant, grupoId, incluirArchivados === 'true');
  }

  @Post('grupos/:grupoId/roles')
  async crear(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: CrearRolGrupoRequest
  ): Promise<RolGrupoDto> {
    return await this.roles.crear(tenant, grupoId, datos);
  }

  @Patch('roles/:rolGrupoId')
  async actualizar(
    @CurrentTenant() tenant: TenantContext,
    @Param('rolGrupoId') rolGrupoId: string,
    @Body() datos: ActualizarRolGrupoRequest
  ): Promise<RolGrupoDto> {
    return await this.roles.actualizar(tenant, rolGrupoId, datos);
  }

  /** Asignar, cambiar o quitar (`rolGrupoId: null`) el rol de un participante. */
  @Put('grupos/:grupoId/usuarios/:usuarioId/rol')
  async asignar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Param('usuarioId') usuarioId: string,
    @Body() datos: AsignarRolGrupoRequest
  ): Promise<RolGrupoDto | null> {
    return await this.roles.asignar(tenant, grupoId, usuarioId, datos);
  }
}
