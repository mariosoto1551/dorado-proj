import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { NotificacionDto, Rol, TenantContext } from '@dorado/shared-types';

import { NotificacionesService } from './notificaciones.service';
import {
  MisNotificacionesQuery,
  MisNotificacionesResponse,
  NoLeidasCountResponse,
} from './dto/notificaciones.dto';

// "Cualquiera autenticado" (spec): los tres roles operativos del MVP —
// PLATFORM_ADMIN queda fuera hasta Fase 14, como en el resto de la API.
@Controller('notification')
@UseGuards(TenantContextGuard, RolesGuard)
@Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get('mis-notificaciones')
  async misNotificaciones(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: MisNotificacionesQuery
  ): Promise<MisNotificacionesResponse> {
    return await this.notificaciones.misNotificaciones(tenant, query);
  }

  @Get('no-leidas/count')
  async contarNoLeidas(@CurrentTenant() tenant: TenantContext): Promise<NoLeidasCountResponse> {
    return await this.notificaciones.contarNoLeidas(tenant);
  }

  @Patch('leer-todas')
  async marcarTodasLeidas(
    @CurrentTenant() tenant: TenantContext
  ): Promise<{ actualizadas: number }> {
    return await this.notificaciones.marcarTodasLeidas(tenant);
  }

  @Patch(':id/leer')
  async marcarLeida(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<NotificacionDto> {
    return await this.notificaciones.marcarLeida(tenant, id);
  }
}
