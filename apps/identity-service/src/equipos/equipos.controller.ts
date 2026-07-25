import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { EquipoDto, Rol, TenantContext } from '@dorado/shared-types';

import {
  AgregarMiembroEquipoRequest,
  CrearEquipoRequest,
  EditarEquipoRequest,
  SustituirJefeEquipoRequest,
} from './dto/equipos.dto';
import { EquiposService } from './equipos.service';

/**
 * Gestión de equipos por el Tutor/ORG_ADMIN del grupo (fase-14-09). El acceso
 * al grupo se valida en el service vía AccesoGrupoService (ORG_ADMIN implícito,
 * TUTOR solo sus grupos).
 */
@Controller('identity')
@UseGuards(TenantContextGuard, RolesGuard)
@Roles(Rol.TUTOR, Rol.ORG_ADMIN)
export class EquiposController {
  constructor(private readonly equipos: EquiposService) {}

  @Get('grupos/:grupoId/equipos')
  async listar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<EquipoDto[]> {
    return await this.equipos.listar(tenant, grupoId);
  }

  @Post('grupos/:grupoId/equipos')
  async crear(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: CrearEquipoRequest
  ): Promise<EquipoDto> {
    return await this.equipos.crear(tenant, grupoId, datos);
  }

  @Get('equipos/:equipoId')
  async detalle(
    @CurrentTenant() tenant: TenantContext,
    @Param('equipoId') equipoId: string
  ): Promise<EquipoDto> {
    return await this.equipos.detalle(tenant, equipoId);
  }

  @Patch('equipos/:equipoId')
  async editar(
    @CurrentTenant() tenant: TenantContext,
    @Param('equipoId') equipoId: string,
    @Body() datos: EditarEquipoRequest
  ): Promise<EquipoDto> {
    return await this.equipos.editar(tenant, equipoId, datos);
  }

  @Post('equipos/:equipoId/miembros')
  async agregarMiembro(
    @CurrentTenant() tenant: TenantContext,
    @Param('equipoId') equipoId: string,
    @Body() datos: AgregarMiembroEquipoRequest
  ): Promise<EquipoDto> {
    return await this.equipos.agregarMiembro(tenant, equipoId, datos);
  }

  @Delete('equipos/:equipoId/miembros/:usuarioId')
  async quitarMiembro(
    @CurrentTenant() tenant: TenantContext,
    @Param('equipoId') equipoId: string,
    @Param('usuarioId') usuarioId: string
  ): Promise<EquipoDto> {
    return await this.equipos.quitarMiembro(tenant, equipoId, usuarioId);
  }

  @Post('equipos/:equipoId/jefe')
  async sustituirJefe(
    @CurrentTenant() tenant: TenantContext,
    @Param('equipoId') equipoId: string,
    @Body() datos: SustituirJefeEquipoRequest
  ): Promise<EquipoDto> {
    return await this.equipos.sustituirJefe(tenant, equipoId, datos);
  }
}
