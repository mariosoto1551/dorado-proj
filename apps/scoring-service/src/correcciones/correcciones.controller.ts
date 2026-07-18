import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { EventoPuntosDto, Rol, TenantContext } from '@dorado/shared-types';

import { CorreccionesService } from './correcciones.service';
import { CorregirEventoPuntosRequest } from './dto/correcciones.dto';

@Controller('scoring')
@UseGuards(TenantContextGuard, RolesGuard)
export class CorreccionesController {
  constructor(private readonly correcciones: CorreccionesService) {}

  @Post('eventos-puntos/:id/corregir')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async corregir(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() datos: CorregirEventoPuntosRequest
  ): Promise<EventoPuntosDto> {
    return await this.correcciones.corregir(tenant, id, datos);
  }
}
