import { Transform } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

import type { RegistroAuditoriaDto } from '@dorado/shared-types';

/**
 * GET /audit/grupos/:grupoId — filtros de la spec + paginación (mismo shape
 * `{ items, total, pagina, porPagina }` que notification, documentado en
 * docs/progreso/fase-09).
 */
export class ListarAuditoriaQuery {
  @IsOptional()
  @IsString()
  entidadTipo?: string;

  @IsOptional()
  @IsString()
  entidadId?: string;

  @IsOptional()
  @IsISO8601()
  desde?: string;

  @IsOptional()
  @IsISO8601()
  hasta?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina?: number;
}

export interface ListarAuditoriaResponse {
  items: RegistroAuditoriaDto[];
  total: number;
  pagina: number;
  porPagina: number;
}
