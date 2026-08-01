import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsUUID, ValidateNested } from 'class-validator';

// Request de rendimiento por zona (spec fase-14-22 Parte D). El Response es
// RendimientoZonaDto[] de shared-types.

export class RendimientoZonaItem {
  @IsUUID()
  umbralZonaId!: string;

  /** Puede ser negativo (dispara la bancarrota) y puede ser 0. Int (regla 5). */
  @IsInt()
  monedas!: number;
}

export class ConfigurarRendimientosRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RendimientoZonaItem)
  rendimientos!: RendimientoZonaItem[];
}
