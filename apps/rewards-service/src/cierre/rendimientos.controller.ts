import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import {
  RendimientosAccionesDto,
  RendimientoZonaDto,
  Rol,
  TenantContext,
  ValorEnMonedasDto,
} from '@dorado/shared-types';

import { ConfigurarRendimientosAccionesRequest } from './dto/rendimientos-acciones.dto';
import { ConfigurarRendimientosRequest } from './dto/rendimientos.dto';
import { RendimientosAccionesService } from './rendimientos-acciones.service';
import { RendimientosService } from './rendimientos.service';

@Controller('rewards')
@UseGuards(TenantContextGuard, RolesGuard)
export class RendimientosController {
  constructor(
    private readonly rendimientos: RendimientosService,
    private readonly acciones: RendimientosAccionesService
  ) {}

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

  /**
   * fase-14-28 Parte C: la SEGUNDA fuente de la economía. Trae el catálogo
   * completo del Grupo —incluidas las acciones que todavía no tienen fila—,
   * mismo criterio que el `GET` de zonas de arriba.
   */
  @Get('grupos/:grupoId/rendimientos-acciones')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async listarAcciones(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<RendimientosAccionesDto> {
    return await this.acciones.listar(tenant, grupoId);
  }

  @Put('grupos/:grupoId/rendimientos-acciones')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async configurarAcciones(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: ConfigurarRendimientosAccionesRequest
  ): Promise<RendimientosAccionesDto> {
    return await this.acciones.configurar(tenant, grupoId, datos);
  }

  /**
   * fase-14-28 Parte F: lo que el PARTICIPANTE ve antes de completar. El `GET`
   * de arriba es del Tutor y trae el catálogo entero con nombres y motivos;
   * este trae el mínimo y lo puede leer el propio integrante.
   *
   * El TUTOR también, porque desde el #23 T4 marca sobre la MISMA lista del
   * integrante y tiene que ver los mismos números.
   */
  @Get('grupos/:grupoId/valores-en-monedas')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async valoresEnMonedas(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<ValorEnMonedasDto[]> {
    return await this.acciones.valoresParaElParticipante(tenant, grupoId);
  }
}
