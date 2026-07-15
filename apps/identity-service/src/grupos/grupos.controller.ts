import {
  Body,
  Controller,
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
import { GrupoDto, Rol, TenantContext } from '@dorado/shared-types';

import { CrearGrupoRequest, EditarGrupoRequest } from './dto/grupos.dto';
import { GruposService } from './grupos.service';

@Controller('identity/grupos')
@UseGuards(TenantContextGuard, RolesGuard)
@Roles(Rol.TUTOR, Rol.ORG_ADMIN)
export class GruposController {
  constructor(private readonly grupos: GruposService) {}

  @Get()
  async listar(@CurrentTenant() tenant: TenantContext): Promise<GrupoDto[]> {
    return await this.grupos.listar(tenant);
  }

  @Post()
  async crear(
    @CurrentTenant() tenant: TenantContext,
    @Body() datos: CrearGrupoRequest
  ): Promise<GrupoDto> {
    return await this.grupos.crear(tenant, datos);
  }

  @Patch(':id')
  async editar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: EditarGrupoRequest
  ): Promise<GrupoDto> {
    return await this.grupos.editar(tenant, id, datos);
  }
}
