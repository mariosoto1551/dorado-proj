import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import { InternalSecretGuard } from '@dorado/shared-auth';
import type { EntitlementsDto } from '@dorado/shared-types';

import type { PlanOrganizacionResponse } from '../suscripciones/dto/suscripciones.dto';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';

/**
 * Endpoints internos servicio-a-servicio (ADR-00 §4): protegidos por
 * `x-internal-secret`, NUNCA expuestos vía Gateway público. Trabajan con IDs
 * explícitos (el llamador interno es confiable) — sin contexto de tenant.
 */
@Controller('internal/billing')
@UseGuards(InternalSecretGuard)
export class InternalController {
  constructor(private readonly suscripciones: SuscripcionesService) {}

  /** Usado por identity en login/refresh para embeber `plan` en el JWT. */
  @Get('organizaciones/:organizacionId/plan')
  async plan(
    @Param('organizacionId') organizacionId: string
  ): Promise<PlanOrganizacionResponse> {
    return await this.suscripciones.planDeOrganizacion(organizacionId);
  }

  /** Usado por identity (crear Grupo/Tutor/Usuario) y Activity (Fase 5+). */
  @Get('organizaciones/:organizacionId/entitlements')
  async entitlements(
    @Param('organizacionId') organizacionId: string
  ): Promise<EntitlementsDto> {
    return await this.suscripciones.entitlementsDeOrganizacion(organizacionId);
  }
}
