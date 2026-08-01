import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import {
  BilleteraDto,
  MiBilleteraResponse,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { BilleteraService } from './billetera.service';
import { AjustarMonedasRequest, ListarMovimientosQuery } from './dto/billetera.dto';

@Controller('rewards')
@UseGuards(TenantContextGuard, RolesGuard)
export class BilleteraController {
  constructor(private readonly billetera: BilleteraService) {}

  /** Saldo e historial del propio participante. */
  @Get('grupos/:grupoId/mi-billetera')
  @Roles(Rol.USUARIO)
  async miBilletera(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Query() query: ListarMovimientosQuery
  ): Promise<MiBilleteraResponse> {
    return await this.billetera.miBilletera(tenant, grupoId, query);
  }

  /** Saldo de cada participante del grupo, para el panel del Tutor. */
  @Get('grupos/:grupoId/billeteras')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async billeteras(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<BilleteraDto[]> {
    return await this.billetera.billeterasDelGrupo(tenant, grupoId);
  }

  @Post('grupos/:grupoId/usuarios/:usuarioId/ajuste')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async ajustar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Param('usuarioId') usuarioId: string,
    @Body() datos: AjustarMonedasRequest
  ): Promise<BilleteraDto> {
    return await this.billetera.ajustar(tenant, grupoId, usuarioId, datos);
  }
}
