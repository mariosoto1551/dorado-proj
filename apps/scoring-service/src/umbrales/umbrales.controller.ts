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
import { Rol, TenantContext, UmbralZonaDto } from '@dorado/shared-types';

import { UmbralesService } from './umbrales.service';
import { CrearUmbralRequest, EditarUmbralRequest } from './dto/umbrales.dto';

@Controller('scoring')
@UseGuards(TenantContextGuard, RolesGuard)
export class UmbralesController {
  constructor(private readonly umbrales: UmbralesService) {}

  @Post('grupos/:grupoId/umbrales')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async crear(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: CrearUmbralRequest
  ): Promise<UmbralZonaDto> {
    return await this.umbrales.crear(tenant, grupoId, datos);
  }

  @Get('grupos/:grupoId/umbrales')
  @Roles(Rol.USUARIO, Rol.TUTOR, Rol.ORG_ADMIN)
  async listar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<UmbralZonaDto[]> {
    return await this.umbrales.listar(tenant, grupoId);
  }

  @Patch('umbrales/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async editar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: EditarUmbralRequest
  ): Promise<UmbralZonaDto> {
    return await this.umbrales.editar(tenant, id, datos);
  }

  /** Devuelve la fila eliminada (mismo criterio que archivar en activity). */
  @Delete('umbrales/:id')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async eliminar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<UmbralZonaDto> {
    return await this.umbrales.eliminar(tenant, id);
  }
}
