import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/**
 * Query de `GET /internal/scoring/grupos/:grupoId/sesiones/:sesionId/ajustes`
 * (fase-14-34).
 *
 * Va como objeto y no como parámetros sueltos del método por la regla 2 de
 * estilo, y porque el cursor son dos campos que solo tienen sentido juntos.
 */
export class AjustesSesionInternaQuery {
  /**
   * Del llamador interno, no del cliente: activity-service lo saca del JWT ya
   * validado y lo reenvía (regla 3 de CLAUDE.md; el endpoint interno no tiene
   * contexto de tenant propio — ADR-00 §4).
   */
  @IsUUID()
  organizacionId!: string;

  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  /** Instante del cursor del timeline; se pide lo estrictamente más viejo. */
  @IsOptional()
  @IsISO8601()
  cursorCreatedAt?: string;

  /** Desempate del cursor: dos asientos del mismo milisegundo son normales. */
  @IsOptional()
  @IsString()
  cursorId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(101)
  limite?: number;
}
