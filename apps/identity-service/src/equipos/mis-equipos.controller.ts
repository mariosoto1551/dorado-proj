import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentTenant, TenantContextGuard } from '@dorado/shared-auth';
import { MiEquipoDto, TenantContext } from '@dorado/shared-types';

import { EquiposService } from './equipos.service';

/**
 * Equipos del participante autenticado (fase-14-09). A diferencia de
 * `EquiposController` (solo TUTOR/ORG_ADMIN), este acepta la sesión USUARIO para
 * que el integrante vea su equipo y sepa si es jefe.
 */
@Controller('identity')
@UseGuards(TenantContextGuard)
export class MisEquiposController {
  constructor(private readonly equipos: EquiposService) {}

  @Get('mis-equipos')
  async misEquipos(@CurrentTenant() tenant: TenantContext): Promise<MiEquipoDto[]> {
    return await this.equipos.misEquipos(tenant);
  }
}
