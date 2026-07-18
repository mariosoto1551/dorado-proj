import { IsUUID } from 'class-validator';

import type { RecompensaDto } from '@dorado/shared-types';

// POST /rewards/usuarios/:usuarioId/secciones/:seccionId/seleccionar
// (sortear no lleva body). Los Response de canje son CanjeRecompensaDto.
export class SeleccionarRecompensaRequest {
  @IsUUID()
  recompensaId!: string;
}

/** Por qué la lista de elegibles vino vacía (la spec pide "con motivo"). */
export type MotivoSinElegibles = 'SECCION_NO_EVALUADA' | 'DESCALIFICADO' | 'SIN_ZONA';

/**
 * GET /rewards/usuarios/:usuarioId/secciones/:seccionId/elegibles — shape no
 * definido en shared-types (documentado en docs/progreso/fase-08): las
 * recompensas ACTIVA de la zona alcanzada, separadas por mecánica, o listas
 * vacías con `motivo` cuando no hay elegibilidad.
 */
export interface ElegiblesResponse {
  motivo: MotivoSinElegibles | null;
  disponiblesSeleccion: RecompensaDto[];
  disponiblesAzar: RecompensaDto[];
}
