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

// Requests de la billetera (spec fase-14-22 Parte D). Los Response son
// BilleteraDto / MiBilleteraResponse de shared-types.

export class AjustarMonedasRequest {
  /** Con signo: positivo acredita, negativo descuenta. Nunca 0. */
  @IsInt()
  monto!: number;

  /** Obligatorio: un movimiento manual sin explicación es inauditable. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  motivo!: string;
}

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
