import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type {
  AdminCambiarEstadoOrgResponse,
  AdminCambiarPlanResponse,
  AdminListarOrganizacionesResponse,
  AdminOrganizacionDetalleDto,
  CodigoPlan,
  EstadoOrganizacion,
} from '@dorado/shared-types';

import { AdminService } from './admin.service';
import { AdminCambiarEstadoOrgRequest, AdminCambiarPlanRequest } from './dto/admin.dto';
import { CurrentAdminId, PlatformAdminGuard } from './platform-admin.guard';

const PAGE_SIZE_MAX = 100;

/**
 * Endpoints de gestión del panel de PLATFORM_ADMIN (fase-14-05). Todos exigen
 * un JWT con `rol = PLATFORM_ADMIN` (`PlatformAdminGuard`). Cross-tenant: el
 * guard no setea contexto de tenant a propósito (ver AdminService).
 */
@Controller('admin')
@UseGuards(PlatformAdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('organizaciones')
  async listar(
    @Query('q') q?: string,
    @Query('plan') plan?: CodigoPlan,
    @Query('estado') estado?: EstadoOrganizacion,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ): Promise<AdminListarOrganizacionesResponse> {
    return await this.admin.listarOrganizaciones({
      q,
      plan,
      estado,
      page: this.entero(page, 1, 1),
      pageSize: this.entero(pageSize, 20, 1, PAGE_SIZE_MAX),
    });
  }

  @Get('organizaciones/:id')
  async detalle(@Param('id') id: string): Promise<AdminOrganizacionDetalleDto> {
    return await this.admin.detalleOrganizacion(id);
  }

  @Post('organizaciones/:id/plan')
  async cambiarPlan(
    @Param('id') id: string,
    @Body() datos: AdminCambiarPlanRequest,
    @CurrentAdminId() adminId: string
  ): Promise<AdminCambiarPlanResponse> {
    return await this.admin.cambiarPlan(id, datos.plan, adminId);
  }

  @Post('organizaciones/:id/estado')
  async cambiarEstado(
    @Param('id') id: string,
    @Body() datos: AdminCambiarEstadoOrgRequest,
    @CurrentAdminId() adminId: string
  ): Promise<AdminCambiarEstadoOrgResponse> {
    return await this.admin.cambiarEstado(id, datos.estado, adminId);
  }

  /** Parseo defensivo de query numérica con default y cotas (no confía en el cliente). */
  private entero(valor: string | undefined, porDefecto: number, min: number, max?: number): number {
    const n = Number.parseInt(valor ?? '', 10);

    if (Number.isNaN(n) || n < min) {
      return porDefecto;
    }

    if (max !== undefined && n > max) {
      return max;
    }

    return n;
  }
}
