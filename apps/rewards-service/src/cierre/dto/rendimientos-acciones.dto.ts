import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

import { TipoAccionRendimiento } from '@dorado/shared-types';

// Request de rendimiento por acción (spec fase-14-28 Parte C). El Response es
// RendimientosAccionesDto de shared-types.

export class RendimientoAccionItem {
  @IsEnum(TipoAccionRendimiento)
  tipoAccion!: TipoAccionRendimiento;

  /** actividadId o conductaId según `tipoAccion`. Se valida contra activity. */
  @IsUUID()
  origenId!: string;

  /**
   * Nunca negativo (decisión 4): lo que se hace no debita. El `@Min(0)` acá es
   * la primera línea; el service igual tira `MONEDAS_INVALIDAS` para que el
   * code de negocio exista aunque el request entre por otro camino.
   */
  @IsInt()
  @Min(0)
  monedas!: number;

  /** Se fuerza a 0 fuera de una actividad de alcance EQUIPO (decisión 8). */
  @IsOptional()
  @IsInt()
  @Min(0)
  monedasBonoJefe?: number;
}

export class ConfigurarRendimientosAccionesRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RendimientoAccionItem)
  rendimientos!: RendimientoAccionItem[];
}
