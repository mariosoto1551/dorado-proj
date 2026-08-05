import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import {
  RegistrarPropuestaAplicadaRequest,
  ResultadoOperacionIa,
} from '@dorado/shared-types';

export class ResultadoOperacionBody implements ResultadoOperacionIa {
  @IsString()
  @MaxLength(64)
  opId!: string;

  @IsBoolean()
  ok!: boolean;

  @IsOptional()
  @IsUUID()
  entidadId?: string;

  /**
   * Viene del error que devolvió la API destino. Se acota el largo: es texto
   * que este servicio guarda sin interpretar, y un cliente podría mandar
   * cualquier cosa.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  error?: string;
}

export class RegistrarAplicadaBody implements RegistrarPropuestaAplicadaRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ResultadoOperacionBody)
  resultado!: ResultadoOperacionBody[];
}
