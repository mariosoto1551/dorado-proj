import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { EstadoCatalogo, TipoConducta } from '../../generated/prisma/enums';

// POST /activity/grupos/:grupoId/conductas
// Sin chequeo de límite de plan (spec fase-05: EntitlementsDto no define
// límite para conductas — explícito en la tabla de endpoints).
export class CrearConductaRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsEnum(TipoConducta)
  tipo!: TipoConducta;

  // Siempre positivo (spec): el signo se aplica según tipo al registrar (Fase 7).
  @IsInt()
  @Min(1)
  valorPuntos!: number;

  // Solo relevante si tipo = MALA; en BUENA se fuerza a false (spec fase-05).
  @IsOptional()
  @IsBoolean()
  permiteAutoreporte?: boolean;
}

// PATCH /activity/conductas/:id — mismo criterio que actividades: `estado`
// no se edita por acá (archivar es DELETE, sin reactivación).
export class EditarConductaRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsEnum(TipoConducta)
  tipo?: TipoConducta;

  @IsOptional()
  @IsInt()
  @Min(1)
  valorPuntos?: number;

  @IsOptional()
  @IsBoolean()
  permiteAutoreporte?: boolean;
}

// GET /activity/grupos/:grupoId/conductas?estado= — igual regla que actividades.
export class ListarConductasQuery {
  @IsOptional()
  @IsIn(Object.values(EstadoCatalogo))
  estado?: EstadoCatalogo;
}

// Sin clases Response propias: los Response de este CRUD son ConductaDto de
// `libs/shared-types` (la "vista pública" según shared-types.md).
