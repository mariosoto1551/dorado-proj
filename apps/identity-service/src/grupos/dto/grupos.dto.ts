import { IsNotEmpty, IsOptional, IsString, IsTimeZone, MaxLength } from 'class-validator';

// POST /identity/grupos
export class CrearGrupoRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  // IANA tz, ej "America/La_Paz" (spec fase-02, modelo Grupo).
  @IsTimeZone()
  timezone!: string;
}

// PATCH /identity/grupos/:id — edita nombre/timezone (spec).
export class EditarGrupoRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
