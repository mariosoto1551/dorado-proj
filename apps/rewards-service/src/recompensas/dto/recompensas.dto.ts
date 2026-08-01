import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { TipoItemCatalogo } from '@dorado/shared-types';

import { EstadoCatalogo } from '../../generated/prisma/enums';

// Requests de recompensas (spec fase-08). Los Response son RecompensaDto de
// shared-types. `imagenUrl` solo se guarda — el gating white-label es del
// frontend (Fase 10/14), nunca de este backend.

export class CrearRecompensaRequest {
  /** fase-14-22 decisión 7. Default PREMIO — retro-compatible. */
  @IsOptional()
  @IsIn(Object.values(TipoItemCatalogo))
  tipo?: TipoItemCatalogo;

  /**
   * fase-14-22 decisión 13: obligatorio solo en modo DIRECTO (lo valida el
   * service, que es quien conoce el modo del Grupo). En TIENDA se ignora.
   */
  @IsOptional()
  @IsUUID()
  umbralZonaId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  imagenUrl?: string;

  @IsOptional()
  @IsBoolean()
  permiteSeleccion?: boolean;

  @IsOptional()
  @IsBoolean()
  permiteAzar?: boolean;
}

export class EditarRecompensaRequest {
  @IsOptional()
  @IsIn(Object.values(TipoItemCatalogo))
  tipo?: TipoItemCatalogo;

  @IsOptional()
  @IsUUID()
  umbralZonaId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @IsOptional()
  @IsUrl({ require_tld: false })
  imagenUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  permiteSeleccion?: boolean;

  @IsOptional()
  @IsBoolean()
  permiteAzar?: boolean;
}

// GET /rewards/grupos/:grupoId/recompensas?umbralZonaId=&estado=
export class ListarRecompensasQuery {
  @IsOptional()
  @IsUUID()
  umbralZonaId?: string;

  @IsOptional()
  @IsIn(Object.values(EstadoCatalogo))
  estado?: EstadoCatalogo;
}
