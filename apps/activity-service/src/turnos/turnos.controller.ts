import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { CurrentTenant, Roles, RolesGuard, TenantContextGuard } from '@dorado/shared-auth';
import {
  AsignacionTurnoDto,
  Rol,
  TenantContext,
  TurnoActividadDto,
  TurnoDeHoyDelGrupoDto,
} from '@dorado/shared-types';

import { ConfigurarTurnoRequest, ReasignarTurnoRequest } from './dto/turnos.dto';
import { TurnosService } from './turnos.service';

/**
 * Turnos rotativos de una obligatoria (fase-14-21): a quién le toca hacerla.
 * Solo TUTOR/ORG_ADMIN — el participante ve su turno del día dentro de
 * `mi-estado-hoy`, no por acá.
 */
@Controller('activity')
@UseGuards(TenantContextGuard, RolesGuard)
@Roles(Rol.TUTOR, Rol.ORG_ADMIN)
export class TurnosController {
  constructor(private readonly turnos: TurnosService) {}

  @Get('actividades/:id/turno')
  async obtener(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') actividadId: string
  ): Promise<TurnoActividadDto> {
    return await this.turnos.obtener(tenant, actividadId);
  }

  @Put('actividades/:id/turno')
  async configurar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') actividadId: string,
    @Body() datos: ConfigurarTurnoRequest
  ): Promise<TurnoActividadDto> {
    return await this.turnos.configurar(tenant, actividadId, datos);
  }

  @Delete('actividades/:id/turno')
  @HttpCode(204)
  async apagar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') actividadId: string
  ): Promise<void> {
    await this.turnos.apagar(tenant, actividadId);
  }

  @Post('actividades/:id/turno/reasignar')
  async reasignar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') actividadId: string,
    @Body() datos: ReasignarTurnoRequest
  ): Promise<AsignacionTurnoDto> {
    return await this.turnos.reasignar(tenant, actividadId, datos);
  }

  @Get('grupos/:grupoId/turnos-de-hoy')
  async turnosDeHoy(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<TurnoDeHoyDelGrupoDto[]> {
    return await this.turnos.turnosDeHoy(tenant, grupoId);
  }
}
