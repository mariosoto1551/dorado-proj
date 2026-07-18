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

// Requests de umbrales (spec fase-07). Los Response son UmbralZonaDto de
// shared-types. `puntosMax: null` es válido y significativo (zona sin tope) —
// por eso ValidateIf en vez de IsOptional, que también saltearía el null.

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

export class CrearUmbralRequest {
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

export class EditarUmbralRequest {
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
