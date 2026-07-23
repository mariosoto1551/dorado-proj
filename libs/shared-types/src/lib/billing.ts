export enum CodigoPlan {
  FREE = 'FREE',
  PRO = 'PRO',
}

export interface PlanDto {
  id: string;
  codigo: CodigoPlan;
  nombre: string;
  limiteTutores: number | null;
  limiteUsuarios: number | null;
  limiteGrupos: number | null;
  limiteActividadesPorGrupo: number | null;
  whiteLabel: boolean;
  reportesAvanzados: boolean;
}

export interface SuscripcionDto {
  id: string;
  organizacionId: string;
  planId: string;
  plan: CodigoPlan;
  estado: 'ACTIVA' | 'CANCELADA';
  // Coincide con el enum Prisma real de billing (fase-04). Antes decía
  // 'MANUAL' | 'FLAG' por un desajuste con el schema — corregido en fase-14-05.
  fuente: 'AUTOMATICA' | 'MANUAL';
}

export interface EntitlementsDto {
  plan: CodigoPlan;
  limites: {
    tutores: number | null;
    usuarios: number | null;
    grupos: number | null;
    actividadesPorGrupo: number | null;
  };
  features: {
    whiteLabel: boolean;
    reportesAvanzados: boolean;
  };
}
