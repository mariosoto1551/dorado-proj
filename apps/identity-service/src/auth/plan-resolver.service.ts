import { Injectable } from '@nestjs/common';

import { CodigoPlan } from '@dorado/shared-types';

/**
 * Punto ÚNICO de resolución del plan de una organización (fase-02, "Decisión
 * de esta fase: plan hardcodeado a FREE"). Billing no existe hasta Fase 4;
 * el plan embebido en el JWT es siempre FREE por ahora.
 */
@Injectable()
export class PlanResolverService {
  // TODO Fase 4: reemplazar por llamada real a billing-service
  // (GET /internal/billing/organizaciones/:id/plan).
  async resolvePlan(_organizacionId: string): Promise<CodigoPlan> {
    return CodigoPlan.FREE;
  }
}
