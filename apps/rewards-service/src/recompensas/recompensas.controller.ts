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
import { RecompensaDto, Rol, TenantContext } from '@dorado/shared-types';

import { RecompensasService } from './recompensas.service';
import {
  CrearRecompensaRequest,
  EditarRecompensaRequest,
  ListarRecompensasQuery,
} from './dto/recompensas.dto';

@Controller('rewards')
@UseGuards(TenantContextGuard, RolesGuard)
export class RecompensasController {
  constructor(private readonly recompensas: RecompensasService) {}

  @Post('grupos/:grupoId/recompensas')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async crear(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: CrearRecompensaRequest
  ): Promise<RecompensaDto> {
    return await this.recompensas.crear(tenant, grupoId, datos);
  }

  @Get('grupos/:grupoId/recompensas')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async listar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Query() query: ListarRecompensasQuery
  ): Promise<RecompensaDto[]> {
    return await this.recompensas.listar(tenant, grupoId, query);
  }

  @Patch('recompensas/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async editar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: EditarRecompensaRequest
  ): Promise<RecompensaDto> {
    return await this.recompensas.editar(tenant, id, datos);
  }

  /** Soft delete: estado = ARCHIVADA (spec). Devuelve la fila archivada. */
  @Delete('recompensas/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async archivar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<RecompensaDto> {
    return await this.recompensas.archivar(tenant, id);
  }
}
