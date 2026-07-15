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
  fuente: 'MANUAL' | 'FLAG';
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
