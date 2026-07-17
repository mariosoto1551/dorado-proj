import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { ConfiguracionSesionDto, Rol, TenantContext } from '@dorado/shared-types';

import { ConfiguracionService } from './configuracion.service';
import { GuardarConfiguracionRequest } from './dto/configuracion.dto';

@Controller('session')
@UseGuards(TenantContextGuard, RolesGuard)
export class ConfiguracionController {
  constructor(private readonly configuracion: ConfiguracionService) {}

  @Put('grupos/:grupoId/configuracion')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async guardar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: GuardarConfiguracionRequest
  ): Promise<ConfiguracionSesionDto> {
    return await this.configuracion.guardar(tenant, grupoId, datos);
  }

  @Get('grupos/:grupoId/configuracion')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN, Rol.USUARIO)
  async obtener(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<ConfiguracionSesionDto> {
    return await this.configuracion.obtener(tenant, grupoId);
  }
}
