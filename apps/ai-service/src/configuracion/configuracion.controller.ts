import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import { CurrentTenant, Roles, RolesGuard, TenantContextGuard } from '@dorado/shared-auth';
import { ConfiguracionIaDto, Rol, TenantContext } from '@dorado/shared-types';

import { ConfiguracionService } from './configuracion.service';
import { CambiarConfiguracionIaBody } from './dto/configuracion.dto';

/**
 * Prefijo `/ai` (el `/api` público lo agrega el Gateway, fase-03).
 *
 * `Rol.USUARIO` no aparece en ningún endpoint de este servicio y no va a
 * aparecer: el participante no habla con el asistente (fase-14-29 decisión 3).
 * Eso deja afuera por construcción todo el ítem #4 de la fase (consentimiento
 * de menores, moderación, retención de conversaciones de chicos).
 */
@Controller('ai')
@UseGuards(TenantContextGuard, RolesGuard)
export class ConfiguracionController {
  constructor(private readonly configuracion: ConfiguracionService) {}

  /** El Tutor necesita saber por qué no tiene el asistente, no solo que no lo tiene. */
  @Get('configuracion')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async obtener(@CurrentTenant() tenant: TenantContext): Promise<ConfiguracionIaDto> {
    return await this.configuracion.obtener(tenant);
  }

  /**
   * Solo ORG_ADMIN: prender el asistente hace que datos del grupo salgan hacia
   * un tercero, y esa es una decisión del dueño de la organización, no de cada
   * Tutor (decisión 5).
   */
  @Put('configuracion')
  @Roles(Rol.ORG_ADMIN)
  async cambiar(
    @CurrentTenant() tenant: TenantContext,
    @Body() datos: CambiarConfiguracionIaBody
  ): Promise<ConfiguracionIaDto> {
    return await this.configuracion.cambiar(tenant, datos);
  }
}
