import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import type {
  ClavesNoCubiertas,
  Exhaustivo,
  CrearUmbralRequest as ContratoCrear,
  EditarUmbralRequest as ContratoEditar,
  GuardarConfiguracionScoringRequest as ContratoConfiguracion,
} from '@dorado/shared-types';

// Requests de umbrales (spec fase-07). Los Response son UmbralZonaDto de
// shared-types. `puntosMax: null` es válido y significativo (zona sin tope) —
// por eso ValidateIf en vez de IsOptional, que también saltearía el null.
//
// Los tres `implements` son del fase-14-30 tanda 2: la escala es lo único que
// se propone con operaciones de tres endpoints distintos, y un campo renombrado
// acá tiene que romper el build de quien la arme.

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

export class CrearUmbralRequest implements ContratoCrear {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombreZona!: string;

  @IsInt()
  @Min(1)
  orden!: number;

  @IsInt()
  puntosMin!: number;

  @ValidateIf((datos: CrearUmbralRequest) => datos.puntosMax !== null && datos.puntosMax !== undefined)
  @IsInt()
  puntosMax?: number | null;

  @Matches(COLOR_HEX, { message: 'colorHex debe tener formato #RRGGBB' })
  colorHex!: string;
}

// PUT /scoring/grupos/:grupoId/configuracion — base de puntos iniciales por
// Sección (fase-14). Entero >= 0; 0 = arrancar en cero (histórico).
export class GuardarConfiguracionScoringRequest implements ContratoConfiguracion {
  @IsInt()
  @Min(0)
  puntosIniciales!: number;
}

export class EditarUmbralRequest implements ContratoEditar {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombreZona?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  orden?: number;

  @IsOptional()
  @IsInt()
  puntosMin?: number;

  @ValidateIf((datos: EditarUmbralRequest) => datos.puntosMax !== null && datos.puntosMax !== undefined)
  @IsInt()
  puntosMax?: number | null;

  @IsOptional()
  @Matches(COLOR_HEX, { message: 'colorHex debe tener formato #RRGGBB' })
  colorHex?: string;
}

// Cobertura de claves (fase-14-30 tanda 2): `implements` sola no ve un campo
// OPCIONAL renombrado — ver la nota de `contratos.ts`.
type _CrearUmbralCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoCrear, CrearUmbralRequest>
>;

type _EditarUmbralCubierto = Exhaustivo<
  ClavesNoCubiertas<ContratoEditar, EditarUmbralRequest>
>;

type _ConfiguracionCubierta = Exhaustivo<
  ClavesNoCubiertas<ContratoConfiguracion, GuardarConfiguracionScoringRequest>
>;
