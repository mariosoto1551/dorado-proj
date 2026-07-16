import { Controller, Get, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { Rol, TenantContext } from '@dorado/shared-types';

import type { MiOrganizacionResponse } from './dto/suscripciones.dto';
import { SuscripcionesService } from './suscripciones.service';

@Controller('billing')
@UseGuards(TenantContextGuard, RolesGuard)
@Roles(Rol.ORG_ADMIN)
export class SuscripcionesController {
  constructor(private readonly suscripciones: SuscripcionesService) {}

  /** Solo lectura — no hay upgrade/downgrade en el MVP (spec fase-04). */
  @Get('mi-organizacion')
  async miOrganizacion(
    @CurrentTenant() tenant: TenantContext
  ): Promise<MiOrganizacionResponse> {
    return await this.suscripciones.miOrganizacion(tenant);
  }
}
