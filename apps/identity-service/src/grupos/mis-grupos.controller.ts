import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentTenant, TenantContextGuard } from '@dorado/shared-auth';
import { GrupoDto, TenantContext } from '@dorado/shared-types';

import { GruposService } from './grupos.service';

/**
 * Grupos del principal autenticado (fase-14). A diferencia de `GruposController`
 * (solo TUTOR/ORG_ADMIN), este acepta cualquier sesión —incluido USUARIO— para
 * que un participante multi-grupo pueda listar sus grupos y elegir el activo.
 */
@Controller('identity')
@UseGuards(TenantContextGuard)
export class MisGruposController {
  constructor(private readonly grupos: GruposService) {}

  @Get('mis-grupos')
  async misGrupos(@CurrentTenant() tenant: TenantContext): Promise<GrupoDto[]> {
    return await this.grupos.misGrupos(tenant);
  }
}
