import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import {
  BilleteraDto,
  MiBilleteraResponse,
  ObjetivoDto,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { BilleteraService } from './billetera.service';
import {
  AjustarMonedasRequest,
  FijarObjetivoRequest,
  ListarMovimientosQuery,
} from './dto/billetera.dto';
import { ObjetivoService } from './objetivo.service';

@Controller('rewards')
@UseGuards(TenantContextGuard, RolesGuard)
export class BilleteraController {
  constructor(
    private readonly billetera: BilleteraService,
    private readonly objetivos: ObjetivoService
  ) {}

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

  /**
   * fase-14-25: fija el objetivo de ahorro. El participante y solo él — el
   * usuarioId sale del JWT, nunca del body (regla 3).
   */
  @Put('grupos/:grupoId/mi-objetivo')
  @Roles(Rol.USUARIO)
  async fijarObjetivo(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: FijarObjetivoRequest
  ): Promise<ObjetivoDto> {
    return await this.objetivos.fijar(tenant, grupoId, datos);
  }

  @Delete('grupos/:grupoId/mi-objetivo')
  @Roles(Rol.USUARIO)
  @HttpCode(204)
  async quitarObjetivo(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<void> {
    await this.objetivos.quitar(tenant, grupoId);
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
