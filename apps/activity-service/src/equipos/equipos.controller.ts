import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import {
  CompletarTareaEquipoResponse,
  ReporteMiembroDto,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import {
  CrearReporteMiembroRequest,
  ListarReportesQuery,
  RechazarReporteRequest,
} from './dto/equipos.dto';
import { ReportesService } from './reportes.service';
import { TareasEquipoService } from './tareas-equipo.service';

/** Tareas de equipo y reportes del jefe (fase-14-09). */
@Controller('activity')
@UseGuards(TenantContextGuard, RolesGuard)
export class EquiposController {
  constructor(
    private readonly tareas: TareasEquipoService,
    private readonly reportes: ReportesService
  ) {}

  /** El jefe (o un Tutor) completa la tarea de equipo → scoring reparte. */
  @Post('equipos/:equipoId/tareas/:actividadId/completar')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async completarTarea(
    @CurrentTenant() tenant: TenantContext,
    @Param('equipoId') equipoId: string,
    @Param('actividadId') actividadId: string
  ): Promise<CompletarTareaEquipoResponse> {
    return await this.tareas.completar(tenant, equipoId, actividadId);
  }

  /** El jefe reporta a un integrante por una conducta MALA concreta. */
  @Post('equipos/:equipoId/reportes')
  @Roles(Rol.USUARIO)
  async crearReporte(
    @CurrentTenant() tenant: TenantContext,
    @Param('equipoId') equipoId: string,
    @Body() datos: CrearReporteMiembroRequest
  ): Promise<ReporteMiembroDto> {
    return await this.reportes.crear(tenant, equipoId, datos);
  }

  /** Bandeja de reportes del grupo (Tutor). */
  @Get('grupos/:grupoId/reportes')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async listarReportes(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Query() query: ListarReportesQuery
  ): Promise<ReporteMiembroDto[]> {
    return await this.reportes.listar(tenant, grupoId, query.estado);
  }

  @Post('reportes/:id/aprobar')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async aprobarReporte(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') reporteId: string
  ): Promise<ReporteMiembroDto> {
    return await this.reportes.aprobar(tenant, reporteId);
  }

  @Post('reportes/:id/rechazar')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async rechazarReporte(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') reporteId: string,
    @Body() datos: RechazarReporteRequest
  ): Promise<ReporteMiembroDto> {
    return await this.reportes.rechazar(tenant, reporteId, datos);
  }
}
