import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { ConfiguracionRecompensasGrupoDto, Rol, TenantContext } from '@dorado/shared-types';

import { ConfiguracionService } from './configuracion.service';
import { CambiarModoRecompensasRequest } from './dto/configuracion.dto';

@Controller('rewards')
@UseGuards(TenantContextGuard, RolesGuard)
export class ConfiguracionController {
  constructor(private readonly configuracion: ConfiguracionService) {}

  /** Cualquier rol del grupo: el participante necesita saber en qué modo está. */
  @Get('grupos/:grupoId/configuracion')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async obtener(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<ConfiguracionRecompensasGrupoDto> {
    return await this.configuracion.obtener(tenant, grupoId);
  }

  @Put('grupos/:grupoId/configuracion')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async cambiar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: CambiarModoRecompensasRequest
  ): Promise<ConfiguracionRecompensasGrupoDto> {
    return await this.configuracion.cambiar(tenant, grupoId, datos);
  }
}
