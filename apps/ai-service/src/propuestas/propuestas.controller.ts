import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import { CurrentTenant, Roles, RolesGuard, TenantContextGuard } from '@dorado/shared-auth';
import { PropuestaIaDto, Rol, TenantContext } from '@dorado/shared-types';

import { RegistrarAplicadaBody } from './dto/propuestas.dto';
import { PropuestasService } from './propuestas.service';

/**
 * Prefijo `/ai` (el `/api` público lo agrega el Gateway).
 *
 * **Ninguno de estos endpoints escribe en otro servicio** (decisión 6). El que
 * aplica es el frontend con el JWT del Tutor contra los endpoints públicos que
 * ya existen; acá solo se lee la propuesta, se la descarta, o se registra qué
 * pasó cuando ya se aplicó.
 */
@Controller('ai/propuestas')
@UseGuards(TenantContextGuard, RolesGuard)
@Roles(Rol.TUTOR, Rol.ORG_ADMIN)
export class PropuestasController {
  constructor(private readonly propuestas: PropuestasService) {}

  @Get(':id')
  async detalle(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<PropuestaIaDto> {
    return await this.propuestas.detalle(tenant, id);
  }

  /**
   * Sin confirmación del lado del cliente y a propósito (regla del fase-14-23
   * T4: *se confirma lo que no tiene vuelta atrás*). Descartar no borra nada
   * que exista en el grupo — la propuesta nunca llegó a tocar una base.
   */
  @Post(':id/descartar')
  async descartar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<PropuestaIaDto> {
    return await this.propuestas.descartar(tenant, id);
  }

  /**
   * El frontend informa el resultado por operación al terminar de aplicar
   * (decisión 13). Una operación que falló no invalida las que salieron bien:
   * la propuesta queda `APLICADA_PARCIAL` con el detalle de las tres filas.
   */
  @Post(':id/aplicada')
  async registrarAplicada(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: RegistrarAplicadaBody
  ): Promise<PropuestaIaDto> {
    return await this.propuestas.registrarAplicada(tenant, id, datos.resultado);
  }
}
