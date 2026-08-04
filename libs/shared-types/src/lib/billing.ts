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
  /** fase-14-29: si el plan habilita el asistente de IA del área del Tutor. */
  asistenteIa: boolean;
  /** fase-14-29: techo mensual de tokens por organización. null = sin límite. */
  cuotaTokensIaMensual: number | null;
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
    /**
     * fase-14-29: tokens de IA por mes y por organización. null = sin límite.
     * A diferencia de los otros cuatro límites, este se consume contra un
     * recurso que paga la plataforma, así que `ai-service` lo corta ANTES de
     * llamar al proveedor, no después.
     */
    tokensIaMensuales: number | null;
  };
  features: {
    whiteLabel: boolean;
    reportesAvanzados: boolean;
    /** fase-14-29: el asistente de IA del área del Tutor. */
    asistenteIa: boolean;
  };
}
