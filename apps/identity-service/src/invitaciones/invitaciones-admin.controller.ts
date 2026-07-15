import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { InvitacionDto, Rol, TenantContext } from '@dorado/shared-types';

import { CrearInvitacionRequest } from './dto/invitaciones.dto';
import { InvitacionesService } from './invitaciones.service';

// Gestión de invitaciones por tutores (spec fase-02, tabla de autenticados).
@Controller('identity')
@UseGuards(TenantContextGuard, RolesGuard)
@Roles(Rol.TUTOR, Rol.ORG_ADMIN)
export class InvitacionesAdminController {
  constructor(private readonly invitaciones: InvitacionesService) {}

  @Post('grupos/:grupoId/invitaciones')
  async crear(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: CrearInvitacionRequest
  ): Promise<InvitacionDto> {
    return await this.invitaciones.crear(tenant, grupoId, datos.tipoInvitado);
  }

  @Get('grupos/:grupoId/invitaciones')
  async listar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<InvitacionDto[]> {
    return await this.invitaciones.listar(tenant, grupoId);
  }

  @Delete('invitaciones/:id')
  @HttpCode(204)
  async revocar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<void> {
    await this.invitaciones.revocar(tenant, id);
  }
}
