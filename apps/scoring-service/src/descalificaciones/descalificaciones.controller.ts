import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { DescalificacionDto, Rol, TenantContext } from '@dorado/shared-types';

import { DescalificacionesService } from './descalificaciones.service';
import { DescalificarUsuarioRequest } from './dto/descalificaciones.dto';

@Controller('scoring')
@UseGuards(TenantContextGuard, RolesGuard)
export class DescalificacionesController {
  constructor(private readonly descalificaciones: DescalificacionesService) {}

  @Post('secciones/:seccionId/usuarios/:usuarioId/descalificar')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async descalificar(
    @CurrentTenant() tenant: TenantContext,
    @Param('seccionId') seccionId: string,
    @Param('usuarioId') usuarioId: string,
    @Body() datos: DescalificarUsuarioRequest
  ): Promise<DescalificacionDto> {
    return await this.descalificaciones.descalificar(tenant, seccionId, usuarioId, datos);
  }

  @Get('secciones/:seccionId/descalificaciones')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async listar(
    @CurrentTenant() tenant: TenantContext,
    @Param('seccionId') seccionId: string
  ): Promise<DescalificacionDto[]> {
    return await this.descalificaciones.listar(tenant, seccionId);
  }
}
