import type { CodigoPlan, EntitlementsDto, PlanDto } from '@dorado/shared-types';

import type { Plan, Suscripcion } from '../generated/prisma/client';
import type { SuscripcionWire } from '../suscripciones/dto/suscripciones.dto';

// Mapeadores modelo Prisma -> DTO público (docs/architecture/shared-types.md).
// Mapeo explícito, no spread: el modelo interno puede tener columnas que no
// viajan en un DTO.

export function planADto(plan: Plan): PlanDto {
  return {
    id: plan.id,
    codigo: plan.codigo as CodigoPlan,
    nombre: plan.nombre,
    limiteTutores: plan.limiteTutores,
    limiteUsuarios: plan.limiteUsuarios,
    limiteGrupos: plan.limiteGrupos,
    limiteActividadesPorGrupo: plan.limiteActividadesPorGrupo,
    whiteLabel: plan.whiteLabel,
    reportesAvanzados: plan.reportesAvanzados,
    asistenteIa: plan.asistenteIa,
    cuotaTokensIaMensual: plan.cuotaTokensIaMensual,
  };
}

export function suscripcionAWire(suscripcion: Suscripcion, codigoPlan: CodigoPlan): SuscripcionWire {
  return {
    id: suscripcion.id,
    organizacionId: suscripcion.organizacionId,
    planId: suscripcion.planId,
    plan: codigoPlan,
    estado: suscripcion.estado,
    fuente: suscripcion.fuente,
  };
}

export function entitlementsDePlan(plan: Plan): EntitlementsDto {
  return {
    plan: plan.codigo as CodigoPlan,
    limites: {
      tutores: plan.limiteTutores,
      usuarios: plan.limiteUsuarios,
      grupos: plan.limiteGrupos,
      actividadesPorGrupo: plan.limiteActividadesPorGrupo,
      tokensIaMensuales: plan.cuotaTokensIaMensual,
    },
    features: {
      whiteLabel: plan.whiteLabel,
      reportesAvanzados: plan.reportesAvanzados,
      asistenteIa: plan.asistenteIa,
    },
  };
}
