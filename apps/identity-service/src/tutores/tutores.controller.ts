import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  UseGuards,
} from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { Rol, TenantContext, TutorDto } from '@dorado/shared-types';

import { TutoresService } from './tutores.service';

@Controller('identity')
@UseGuards(TenantContextGuard, RolesGuard)
export class TutoresController {
  constructor(private readonly tutores: TutoresService) {}

  @Get('grupos/:grupoId/tutores')
  @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
  async listarPorGrupo(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string
  ): Promise<TutorDto[]> {
    return await this.tutores.listarPorGrupo(tenant, grupoId);
  }

  @Delete('tutores/:id')
  @Roles(Rol.ORG_ADMIN)
  @HttpCode(204)
  async desactivar(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ): Promise<void> {
    await this.tutores.desactivar(tenant, id);
  }
}
