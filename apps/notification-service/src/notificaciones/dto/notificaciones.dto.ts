import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import type { NotificacionDto } from '@dorado/shared-types';

/**
 * GET /notification/mis-notificaciones — la spec pide paginado explícito pero
 * no define el shape; se documenta acá (y en docs/progreso/fase-09):
 * `{ items, total, pagina, porPagina }`, orden createdAt desc.
 */
export class MisNotificacionesQuery {
  @IsOptional()
  @IsIn(['true', 'false'])
  leida?: 'true' | 'false';

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

export interface MisNotificacionesResponse {
  items: NotificacionDto[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface NoLeidasCountResponse {
  count: number;
}
