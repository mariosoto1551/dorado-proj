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
import { ConductaDto, Rol, TenantContext } from '@dorado/shared-types';

import { ConductasService } from './conductas.service';
import {
  CrearConductaRequest,
  EditarConductaRequest,
  ListarConductasQuery,
} from './dto/conductas.dto';

// Sin GET /activity/conductas/:id — la spec fase-05 no define endpoint de
// detalle para conductas (solo crear/listar/editar/archivar).
@Controller('activity')
@UseGuards(TenantContextGuard, RolesGuard)
export class ConductasController {
  constructor(private readonly conductas: ConductasService) {}

  @Post('grupos/:grupoId/conductas')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async crear(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: CrearConductaRequest
  ): Promise<ConductaDto> {
    return await this.conductas.crear(tenant, grupoId, datos);
  }

  @Get('grupos/:grupoId/conductas')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN, Rol.USUARIO)
  async listar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Query() query: ListarConductasQuery
  ): Promise<ConductaDto[]> {
    return await this.conductas.listar(tenant, grupoId, query);
  }

  @Patch('conductas/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async editar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: EditarConductaRequest
  ): Promise<ConductaDto> {
    return await this.conductas.editar(tenant, id, datos);
  }

  /** Soft delete: estado = ARCHIVADA (spec fase-05). Devuelve la fila archivada. */
  @Delete('conductas/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async archivar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<ConductaDto> {
    return await this.conductas.archivar(tenant, id);
  }
}
