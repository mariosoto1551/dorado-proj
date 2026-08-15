import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { FiltroTipoHistorial } from '@dorado/shared-types';

/**
 * Tope de una nota interna (fase-14-18): más largo que el `motivoTutor` de 200
 * del ítem 12 a propósito — el motivo es una leyenda para el integrante; esto
 * es una bitácora entre tutores y sí puede ser un descargo.
 */
export const MAX_LARGO_NOTA = 500;

export const LIMITE_PAGINA_HISTORIAL = 50;

/** GET /activity/grupos/:grupoId/historial */
export class HistorialQuery {
  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  /**
   * fase-14-33: qué Sesión de la Sección vigente mostrar. Sin él, la abierta
   * (o la última empezada, decisión 14 del #18) — el default de siempre.
   */
  @IsOptional()
  @IsUUID()
  sesionId?: string;

  /**
   * fase-14-34: `AJUSTE` se suma a los tres de siempre. Es `FiltroTipoHistorial`
   * y no `TipoRegistroHistorial` porque ese otro enum espeja el de Prisma —
   * sobre qué tabla cuelga una nota— y un ajuste no es una fila de este
   * servicio.
   */
  @IsOptional()
  @IsEnum(FiltroTipoHistorial)
  tipo?: FiltroTipoHistorial;

  /**
   * Default `true`: lo anulado se MUESTRA tachado (spec, decisión 11) — es
   * justo lo que el tutor va a querer revisar. El `false` es opt-in.
   */
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  incluirAnulados?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}

/** POST /activity/historial/:registroTipo/:registroId/notas */
export class CrearNotaRegistroRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_LARGO_NOTA)
  texto!: string;
}
