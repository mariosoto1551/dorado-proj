import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

import type {
  ClavesNoCubiertas,
  Exhaustivo,
  AjustarMonedasRequest as ContratoAjustar,
} from '@dorado/shared-types';

// Requests de la billetera (spec fase-14-22 Parte D). Los Response son
// BilleteraDto / MiBilleteraResponse de shared-types.

// El `implements` es un retrofit del fase-14-31: este endpoint pasó a ser
// destino de una propuesta del asistente, y el chequeo de cobertura es lo que
// hace que renombrar `monto` acá rompa el build de quien arme el request en vez
// de fallar recién al aplicarlo.
export class AjustarMonedasRequest implements ContratoAjustar {
  /** Con signo: positivo acredita, negativo descuenta. Nunca 0. */
  @IsInt()
  monto!: number;

  /** Obligatorio: un movimiento manual sin explicación es inauditable. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  motivo!: string;
}

// Cobertura de claves (fase-14-30 tanda 2): `implements` sola no ve un campo
// OPCIONAL renombrado — ver la nota de `contratos.ts`.
type _AjustarMonedasCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoAjustar, AjustarMonedasRequest>
>;

/** fase-14-25: para qué producto de la tienda está ahorrando el participante. */
export class FijarObjetivoRequest {
  @IsUUID()
  productoId!: string;
}

export class ListarMovimientosQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limite?: number;
}
