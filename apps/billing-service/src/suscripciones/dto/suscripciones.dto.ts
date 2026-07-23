import type { CodigoPlan, PlanDto } from '@dorado/shared-types';

/**
 * Forma wire real de una Suscripcion (spec fase-04, schema Prisma).
 *
 * Nota de contrato: `SuscripcionDto.fuente` en shared-types dice
 * `'MANUAL' | 'FLAG'`, pero el enum que la spec de Fase 4 define en base es
 * `AUTOMATICA | MANUAL`. Se expone el wire real y la discrepancia queda
 * señalada en docs/progreso/fase-04-billing.md (no se pisa el contrato
 * documentado desde código — mismo criterio que Fases 2 y 3).
 */
export interface SuscripcionWire {
  id: string;
  organizacionId: string;
  planId: string;
  plan: CodigoPlan;
  estado: 'ACTIVA' | 'CANCELADA';
  fuente: 'AUTOMATICA' | 'MANUAL';
}

/** Response de GET /billing/mi-organizacion: SuscripcionDto + PlanDto (spec). */
export interface MiOrganizacionResponse {
  suscripcion: SuscripcionWire;
  plan: PlanDto;
}

/** Response de GET /internal/billing/organizaciones/:id/plan (spec). */
export interface PlanOrganizacionResponse {
  codigo: CodigoPlan;
}

/** Body de POST /internal/billing/organizaciones/:id/plan (fase-14-05). */
export interface CambiarPlanInternoRequest {
  codigo: CodigoPlan;
}
