import { BadRequestException } from '@nestjs/common';

import { TipoLimiteTiempo } from '../generated/prisma/enums';

export interface CamposLimiteTiempo {
  deadlineHora: string | null;
  duracionCronometroMinutos: number | null;
}

/**
 * Invariante de campos condicionales de `tipoLimiteTiempo` (spec fase-05,
 * validación de aplicación — no a nivel DB):
 *
 * - DEADLINE   → `deadlineHora` obligatoria y `duracionCronometroMinutos` null.
 * - CRONOMETRO → `duracionCronometroMinutos` obligatoria y `deadlineHora` null.
 * - SIN_LIMITE → ambos null.
 *
 * Recibe los valores efectivos (en un PATCH, ya mezclados con la fila
 * existente) y devuelve los campos normalizados a persistir, o lanza 400.
 */
export function validarCamposLimiteTiempo(
  tipo: TipoLimiteTiempo,
  deadlineHora: string | null,
  duracionCronometroMinutos: number | null
): CamposLimiteTiempo {
  if (tipo === TipoLimiteTiempo.DEADLINE) {
    if (!deadlineHora) {
      throw new BadRequestException(
        'deadlineHora es obligatoria cuando tipoLimiteTiempo es DEADLINE'
      );
    }

    if (duracionCronometroMinutos !== null) {
      throw new BadRequestException(
        'duracionCronometroMinutos debe ser null cuando tipoLimiteTiempo es DEADLINE'
      );
    }

    return { deadlineHora, duracionCronometroMinutos: null };
  }

  if (tipo === TipoLimiteTiempo.CRONOMETRO) {
    if (duracionCronometroMinutos === null) {
      throw new BadRequestException(
        'duracionCronometroMinutos es obligatoria cuando tipoLimiteTiempo es CRONOMETRO'
      );
    }

    if (deadlineHora !== null) {
      throw new BadRequestException(
        'deadlineHora debe ser null cuando tipoLimiteTiempo es CRONOMETRO'
      );
    }

    return { deadlineHora: null, duracionCronometroMinutos };
  }

  if (deadlineHora !== null || duracionCronometroMinutos !== null) {
    throw new BadRequestException(
      'deadlineHora y duracionCronometroMinutos deben ser null cuando tipoLimiteTiempo es SIN_LIMITE'
    );
  }

  return { deadlineHora: null, duracionCronometroMinutos: null };
}
