import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { FrecuenciaTurno, ModoTurno } from '../../generated/prisma/enums';

/**
 * Una posición de la secuencia (fase-14-21). SIN `ArrayUnique` a propósito: el
 * mismo participante puede aparecer varias veces —`[José, Luciana, José,
 * Alejandra]`— y eso es exactamente lo que hace que a José le toque el doble.
 */
export class PosicionTurnoRequest {
  @IsUUID()
  usuarioId!: string;
}

// PUT /activity/actividades/:id/turno
export class ConfigurarTurnoRequest {
  @IsEnum(ModoTurno)
  modo!: ModoTurno;

  @IsEnum(FrecuenciaTurno)
  frecuencia!: FrecuenciaTurno;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  /** El ORDEN del array ES la secuencia. */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PosicionTurnoRequest)
  posiciones!: PosicionTurnoRequest[];
}

// POST /activity/actividades/:id/turno/reasignar
export class ReasignarTurnoRequest {
  @IsUUID()
  usuarioId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}
