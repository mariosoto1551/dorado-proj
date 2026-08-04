import { IsBoolean, IsOptional } from 'class-validator';

import type { CambiarConfiguracionIaRequest } from '@dorado/shared-types';

/** `PUT /ai/configuracion` (fase-14-29 Parte C). */
export class CambiarConfiguracionIaBody implements CambiarConfiguracionIaRequest {
  @IsBoolean()
  habilitada!: boolean;

  @IsOptional()
  @IsBoolean()
  aceptaAviso?: boolean;
}
