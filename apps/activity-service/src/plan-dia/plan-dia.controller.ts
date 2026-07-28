import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  Roles,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import { PlanDelDiaDto, Rol, TenantContext } from '@dorado/shared-types';

import { AgregarAlPlanDelDiaRequest } from './dto/plan-dia.dto';
import { PlanDiaService } from './plan-dia.service';

/**
 * Plan del día del integrante (spec fase-14-17). Solo `USUARIO`: el plan es de
 * quien lo hace, no hay ruta de Tutor. No hay `GET` — el estado del plan viaja
 * en `mi-estado-hoy`, que la home ya consulta (decisión 12).
 */
@Controller('activity')
@UseGuards(TenantContextGuard, RolesGuard)
export class PlanDiaController {
  constructor(private readonly planDia: PlanDiaService) {}

  @Post('grupos/:grupoId/plan-dia')
  @Roles(Rol.USUARIO)
  async agregar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Body() datos: AgregarAlPlanDelDiaRequest
  ): Promise<PlanDelDiaDto> {
    return await this.planDia.agregar(tenant, grupoId, datos);
  }

  @Delete('grupos/:grupoId/plan-dia/:actividadId')
  @Roles(Rol.USUARIO)
  async quitar(
    @CurrentTenant() tenant: TenantContext,
    @Param('grupoId') grupoId: string,
    @Param('actividadId') actividadId: string
  ): Promise<PlanDelDiaDto> {
    return await this.planDia.quitar(tenant, grupoId, actividadId);
  }
}
