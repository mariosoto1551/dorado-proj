import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

import { FuenteProducto, MecanicaProducto } from '@dorado/shared-types';

// Requests de la tienda (spec fase-14-22 Partes C y D). Los Response son
// BolsaPremiosDto / ProductoTiendaDto / CompraDto de shared-types.

export class GuardarBolsaRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  /**
   * La lista es EXPLÍCITA y completa (decisión 19): al editar reemplaza, no
   * agrega. Sin ítems no hay bolsa — una bolsa vacía fallaría recién al
   * comprar, que es el peor momento para enterarse.
   */
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  recompensaIds!: string[];
}

export class CrearProductoRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @IsOptional()
  @IsUrl({ require_tld: false })
  imagenUrl?: string | null;

  @IsInt()
  @Min(1)
  precio!: number;

  /** Eje 1 (decisión 18): de dónde sale. */
  @IsIn(Object.values(FuenteProducto))
  fuente!: FuenteProducto;

  /** Eje 2 (decisión 18): cómo se obtiene. Se ignora si fuente = ITEM. */
  @IsOptional()
  @IsIn(Object.values(MecanicaProducto))
  mecanica?: MecanicaProducto;

  @IsOptional()
  @IsUUID()
  recompensaId?: string | null;

  @IsOptional()
  @IsUUID()
  bolsaId?: string | null;
}

export class EditarProductoRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @IsOptional()
  @IsUrl({ require_tld: false })
  imagenUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  precio?: number;

  @IsOptional()
  @IsIn(Object.values(FuenteProducto))
  fuente?: FuenteProducto;

  @IsOptional()
  @IsIn(Object.values(MecanicaProducto))
  mecanica?: MecanicaProducto;

  @IsOptional()
  @IsUUID()
  recompensaId?: string | null;

  @IsOptional()
  @IsUUID()
  bolsaId?: string | null;
}

export class ComprarRequest {
  @IsUUID()
  productoId!: string;

  /** Obligatorio solo con `mecanica = ELECCION` (lo valida el service). */
  @IsOptional()
  @IsUUID()
  recompensaId?: string;

  /** Solo lo usa el Tutor comprando en nombre de un participante. */
  @IsOptional()
  @IsUUID()
  usuarioId?: string;
}

export class RevertirCompraRequest {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}

export class AnularCastigoRequest {
  /** Obligatorio: anular un castigo sin explicación es inauditable. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  motivo!: string;
}
