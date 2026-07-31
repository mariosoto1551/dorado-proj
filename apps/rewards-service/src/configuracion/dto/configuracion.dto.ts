import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { ModoRecompensas } from '@dorado/shared-types';

// Request de configuración de recompensas (spec fase-14-22 Parte D). El
// Response es ConfiguracionRecompensasGrupoDto de shared-types.

export class CambiarModoRecompensasRequest {
  @IsIn(Object.values(ModoRecompensas))
  modo!: ModoRecompensas;

  /**
   * decisión 9: false (default) guarda el cambio como PENDIENTE y lo aplica el
   * consumidor al abrir la próxima Sección; true lo aplica al instante, que es
   * el camino de la primera activación (no hay nada en curso que romper).
   */
  @IsOptional()
  @IsBoolean()
  aplicarAhora?: boolean;

  // Cosméticos: se aplican siempre al instante, no dependen del modo.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  nombreMoneda?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  iconoMoneda?: string;
}
