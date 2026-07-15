import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { Rol, TenantContext, UsuarioDto } from '@dorado/shared-types';

import { EditarUsuarioRequest } from './dto/usuarios.dto';
import { UsuariosService } from './usuarios.service';

@Controller('identity')
@UseGuards(TenantContextGuard, RolesGuard)
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get('grupos/:grupoId/usuarios')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async listarPorGrupo(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<UsuarioDto[]> {
    return await this.usuarios.listarPorGrupo(tenant, grupoId);
  }

  // Sin @Roles: el propio USUARIO también puede editarse; el reparto fino de
  // permisos (propio/tutor del grupo/admin) vive en el servicio.
  @Patch('usuarios/:id')
  async editar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: EditarUsuarioRequest
  ): Promise<UsuarioDto> {
    return await this.usuarios.editar(tenant, id, datos);
  }

  @Delete('usuarios/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  @HttpCode(204)
  async desactivar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<void> {
    await this.usuarios.desactivar(tenant, id);
  }
}
