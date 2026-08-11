import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import {
  CompletarTareaEquipoResponse,
  RegistroTareaEquipoDto,
  ReporteMiembroDto,
  Rol,
  TareaEquipoDeHoyDto,
  TenantContext,
} from '@dorado/shared-types';

import {
  AnularTareaEquipoQuery,
  CompletarTareaEquipoRequest,
  CrearReporteMiembroRequest,
  ListarReportesQuery,
  RechazarReporteRequest,
} from './dto/equipos.dto';
import { RevertirMarcaRequest } from '../registro/dto/registro.dto';
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
    @Param('actividadId') actividadId: string,
    // fase-14-33: el cuerpo es nuevo y opcional entero — el jefe del equipo
    // sigue llamando a este endpoint sin mandar nada.
    @Body() datos: CompletarTareaEquipoRequest = {}
  ): Promise<CompletarTareaEquipoResponse> {
    return await this.tareas.completar(tenant, equipoId, actividadId, datos);
  }

  /** Estado de las tareas del equipo en la sesión abierta (fase-14-13). */
  @Get('equipos/:equipoId/tareas-de-hoy')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async tareasDeHoy(
    @CurrentTenant() tenant: TenantContext,
    @Param('equipoId') equipoId: string
  ): Promise<TareaEquipoDeHoyDto[]> {
    return await this.tareas.tareasDeHoy(tenant, equipoId);
  }

  /**
   * El Tutor anula una tarea de equipo completada: todos los que recibieron
   * puntos por ella los pierden, bono del jefe incluido (fase-14-13). El jefe
   * completa pero NO anula (decisión 4).
   */
  @Delete('registros-tarea-equipo/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async anularTarea(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') registroId: string,
    @Query() query: AnularTareaEquipoQuery
  ): Promise<RegistroTareaEquipoDto> {
    return await this.tareas.anular(tenant, registroId, query.motivo);
  }

  /** El Tutor deshace su propia anulación y le devuelve el reparto al equipo. */
  @Post('registros-tarea-equipo/:id/revertir')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async revertirAnulacionTarea(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') registroId: string,
    // fase-14-33: espejo del revertir de actividades — cuerpo nuevo y opcional.
    @Body() datos: RevertirMarcaRequest = {}
  ): Promise<RegistroTareaEquipoDto> {
    return await this.tareas.revertirAnulacion(tenant, registroId, datos.motivoRetroactivo);
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
