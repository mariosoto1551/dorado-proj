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

import type {
  ClavesNoCubiertas,
  Exhaustivo,
  CrearConductaRequest as ContratoCrear,
  EditarConductaRequest as ContratoEditar,
} from '@dorado/shared-types';

import { EstadoCatalogo, TipoConducta } from '../../generated/prisma/enums';

// POST /activity/grupos/:grupoId/conductas
// Sin chequeo de límite de plan (spec fase-05: EntitlementsDto no define
// límite para conductas — explícito en la tabla de endpoints).
//
// `implements` contra el contrato de `shared-types` (fase-14-30 tanda 2), mismo
// criterio que las actividades: renombrar un campo acá rompe el build de quien
// arme un request con esta forma, en vez de deteriorarlo en silencio.
export class CrearConductaRequest implements ContratoCrear {
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
export class EditarConductaRequest implements ContratoEditar {
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

// Cobertura de claves (fase-14-30 tanda 2): `implements` sola no ve un campo
// OPCIONAL renombrado — ver la nota de `contratos.ts`.
type _CrearConductaCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoCrear, CrearConductaRequest>
>;

type _EditarConductaCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoEditar, EditarConductaRequest>
>;

// Sin clases Response propias: los Response de este CRUD son ConductaDto de
// `libs/shared-types` (la "vista pública" según shared-types.md).
