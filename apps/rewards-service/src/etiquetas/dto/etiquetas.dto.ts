import {
  ArrayMaxSize,
  IsArray,
  IsHexColor,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

import { EstadoCatalogo } from '../../generated/prisma/enums';

// Requests de etiquetas (spec fase-14-26 Parte B). Los Response son
// EtiquetaCatalogoDto / ProductosDesdeEtiquetaDto de shared-types.

/**
 * Tope de interfaz, no de dominio (decisión 8): la tarjeta del catálogo pinta
 * los chips y a partir de acá dejan de comunicar. Vive como constante para que
 * subirlo mañana sea cambiar un número, no descubrir por qué estaba.
 */
export const MAX_ETIQUETAS_POR_ITEM = 5;

export class CrearEtiquetaRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  nombre!: string;

  /** "#RRGGBB". Mismo criterio que UmbralZona.colorHex: lo decide el Tutor. */
  @IsHexColor()
  colorHex!: string;
}

export class EditarEtiquetaRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  nombre?: string;

  @IsOptional()
  @IsHexColor()
  colorHex?: string;
}

// GET /rewards/grupos/:grupoId/etiquetas?estado=
export class ListarEtiquetasQuery {
  @IsOptional()
  @IsIn(Object.values(EstadoCatalogo))
  estado?: EstadoCatalogo;
}

/**
 * PUT /rewards/recompensas/:id/etiquetas — reemplazo COMPLETO, no incremental
 * (mismo criterio que la lista de ítems de una bolsa): lo que viene es lo que
 * queda. Por eso es un PUT sobre un sub-recurso y no un campo del PATCH de
 * recompensa, donde un array vacío sería indistinguible de «no lo mandé».
 */
export class AsignarEtiquetasRequest {
  @IsArray()
  @ArrayMaxSize(MAX_ETIQUETAS_POR_ITEM)
  @IsUUID('4', { each: true })
  etiquetaIds!: string[];
}

/** POST /rewards/grupos/:grupoId/productos/desde-etiqueta */
export class ProductosDesdeEtiquetaRequest {
  @IsUUID()
  etiquetaId!: string;

  /**
   * Valor inicial que se COPIA a cada producto; no queda ningún vínculo.
   * Mínimo 1 por el mismo motivo que el alta de a uno (`PRECIO_INVALIDO`):
   * un producto gratis no participa de ninguna economía.
   */
  @IsInt()
  @Min(1)
  precio!: number;
}
