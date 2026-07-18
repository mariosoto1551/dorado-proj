import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { CanjeRecompensaDto, Rol, TenantContext } from '@dorado/shared-types';

import { CanjesService } from './canjes.service';
import { ElegiblesResponse, SeleccionarRecompensaRequest } from './dto/canjes.dto';

@Controller('rewards')
@UseGuards(TenantContextGuard, RolesGuard)
export class CanjesController {
  constructor(private readonly canjes: CanjesService) {}

  @Get('usuarios/:usuarioId/secciones/:seccionId/elegibles')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async elegibles(
    @CurrentTenant() tenant: TenantContext,
    @Param('usuarioId') usuarioId: string,
    @Param('seccionId') seccionId: string
  ): Promise<ElegiblesResponse> {
    return await this.canjes.elegibles(tenant, usuarioId, seccionId);
  }

  @Post('usuarios/:usuarioId/secciones/:seccionId/seleccionar')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async seleccionar(
    @CurrentTenant() tenant: TenantContext,
    @Param('usuarioId') usuarioId: string,
    @Param('seccionId') seccionId: string,
    @Body() datos: SeleccionarRecompensaRequest
  ): Promise<CanjeRecompensaDto> {
    return await this.canjes.seleccionar(tenant, usuarioId, seccionId, datos.recompensaId);
  }

  @Post('usuarios/:usuarioId/secciones/:seccionId/sortear')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async sortear(
    @CurrentTenant() tenant: TenantContext,
    @Param('usuarioId') usuarioId: string,
    @Param('seccionId') seccionId: string
  ): Promise<CanjeRecompensaDto> {
    return await this.canjes.sortear(tenant, usuarioId, seccionId);
  }

  @Get('grupos/:grupoId/secciones/:seccionId/canjes')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async listarCanjes(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Param('seccionId') seccionId: string
  ): Promise<CanjeRecompensaDto[]> {
    return await this.canjes.listarCanjes(tenant, grupoId, seccionId);
  }

  @Patch('canjes/:id/entregar')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async entregar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') canjeId: string
  ): Promise<CanjeRecompensaDto> {
    return await this.canjes.entregar(tenant, canjeId);
  }
}
