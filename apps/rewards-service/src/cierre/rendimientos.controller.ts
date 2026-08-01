import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { RendimientoZonaDto, Rol, TenantContext } from '@dorado/shared-types';

import { ConfigurarRendimientosRequest } from './dto/rendimientos.dto';
import { RendimientosService } from './rendimientos.service';

@Controller('rewards')
@UseGuards(TenantContextGuard, RolesGuard)
export class RendimientosController {
  constructor(private readonly rendimientos: RendimientosService) {}

  @Get('grupos/:grupoId/rendimientos')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async listar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<RendimientoZonaDto[]> {
    return await this.rendimientos.listar(tenant, grupoId);
  }

  @Put('grupos/:grupoId/rendimientos')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async configurar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: ConfigurarRendimientosRequest
  ): Promise<RendimientoZonaDto[]> {
    return await this.rendimientos.configurar(tenant, grupoId, datos);
  }
}
