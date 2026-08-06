import { IsInt, IsNotEmpty, IsString, MaxLength, NotEquals } from 'class-validator';

import type {
  ClavesNoCubiertas,
  Exhaustivo,
  AjustarPuntosRequest as ContratoAjustar,
} from '@dorado/shared-types';

// POST /scoring/grupos/:grupoId/usuarios/:usuarioId/ajuste (fase-14-31 Parte A).
// El Response es EventoPuntosDto de shared-types: la fila NUEVA del ledger.
//
// El `implements` es de entrada, no de adorno: este endpoint nace para que lo
// llame también una propuesta del asistente (ítem #31), y el chequeo de
// cobertura es lo que hace que renombrar un campo acá rompa el build de quien
// arme el request en vez de fallar recién al aplicarlo.

/** Igual que el motivo del ajuste de monedas (#22): es una nota, no un descargo. */
export const MAX_LARGO_MOTIVO_AJUSTE = 200;

export class AjustarPuntosRequest implements ContratoAjustar {
  /**
   * `NotEquals(0)` y no `Min`/`Max`: un ajuste de 0 no es un error de tipeo que
   * convenga aceptar en silencio — es una fila en el ledger que no dice nada.
   */
  @IsInt()
  @NotEquals(0)
  puntos!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LARGO_MOTIVO_AJUSTE)
  motivo!: string;
}

// Cobertura de claves (fase-14-30 tanda 2): `implements` sola no ve un campo
// OPCIONAL renombrado — ver la nota de `contratos.ts`.
type _AjustarPuntosCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoAjustar, AjustarPuntosRequest>
>;
