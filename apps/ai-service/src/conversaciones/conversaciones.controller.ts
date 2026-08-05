import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentTenant, Roles, RolesGuard, TenantContextGuard } from '@dorado/shared-auth';
import {
  ConversacionIaDetalleDto,
  ConversacionIaDto,
  EnviarMensajeIaResponse,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { ConversacionesService } from './conversaciones.service';
import { CrearConversacionBody, EnviarMensajeBody } from './dto/conversaciones.dto';

/**
 * Prefijo `/ai` (el `/api` público lo agrega el Gateway, fase-03).
 *
 * `Rol.USUARIO` no aparece en ningún endpoint y no va a aparecer: el
 * participante no habla con el asistente (decisión 3). A diferencia del `PUT`
 * de configuración —que es del dueño porque prende el envío de datos a un
 * tercero—, conversar sí es de cualquier Tutor: la decisión de exponer los
 * datos ya la tomó el ORG_ADMIN al habilitar.
 */
@Controller('ai/conversaciones')
@UseGuards(TenantContextGuard, RolesGuard)
@Roles(Rol.TUTOR, Rol.ORG_ADMIN)
export class ConversacionesController {
  constructor(private readonly conversaciones: ConversacionesService) {}

  @Get()
  async listar(
    @CurrentTenant() tenant: TenantContext,
    @Query('grupoId', ParseUUIDPipe) grupoId: string
  ): Promise<ConversacionIaDto[]> {
    return await this.conversaciones.listar(tenant, grupoId);
  }

  @Post()
  async crear(
    @CurrentTenant() tenant: TenantContext,
    @Body() datos: CrearConversacionBody
  ): Promise<ConversacionIaDetalleDto> {
    return await this.conversaciones.crear(tenant, datos);
  }

  @Get(':id')
  async detalle(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ConversacionIaDetalleDto> {
    return await this.conversaciones.detalle(tenant, id);
  }

  /**
   * Manda un mensaje y devuelve la respuesta completa.
   *
   * **La spec pide SSE acá y esto todavía no lo es** (Parte C). Se resuelve en
   * la tanda 6, junto con la pantalla que lo consume y con el cable que la
   * propia spec marca como riesgoso: que el proxy del Gateway no buffere
   * `text/event-stream`. Streamear contra un cliente que no existe habría
   * dejado sin verificar justamente lo que puede romperse.
   */
  @Post(':id/mensajes')
  async enviarMensaje(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: EnviarMensajeBody
  ): Promise<EnviarMensajeIaResponse> {
    return await this.conversaciones.enviarMensaje(tenant, id, datos.texto);
  }

  @Post(':id/archivar')
  async archivar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ConversacionIaDto> {
    return await this.conversaciones.archivar(tenant, id);
  }
}
