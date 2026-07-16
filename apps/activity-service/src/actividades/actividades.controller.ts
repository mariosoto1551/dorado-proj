import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { ActividadDto, Rol, TenantContext } from '@dorado/shared-types';

import { ActividadesService } from './actividades.service';
import {
  CrearActividadRequest,
  EditarActividadRequest,
  ListarActividadesQuery,
} from './dto/actividades.dto';

@Controller('activity')
@UseGuards(TenantContextGuard, RolesGuard)
export class ActividadesController {
  constructor(private readonly actividades: ActividadesService) {}

  @Post('grupos/:grupoId/actividades')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async crear(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: CrearActividadRequest
  ): Promise<ActividadDto> {
    return await this.actividades.crear(tenant, grupoId, datos);
  }

  @Get('grupos/:grupoId/actividades')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN, Rol.USUARIO)
  async listar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Query() query: ListarActividadesQuery
  ): Promise<ActividadDto[]> {
    return await this.actividades.listar(tenant, grupoId, query);
  }

  @Get('actividades/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN, Rol.USUARIO)
  async detalle(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<ActividadDto> {
    return await this.actividades.detalle(tenant, id);
  }

  @Patch('actividades/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async editar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: EditarActividadRequest
  ): Promise<ActividadDto> {
    return await this.actividades.editar(tenant, id, datos);
  }

  /** Soft delete: estado = ARCHIVADA (spec fase-05). Devuelve la fila archivada. */
  @Delete('actividades/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async archivar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<ActividadDto> {
    return await this.actividades.archivar(tenant, id);
  }
}
