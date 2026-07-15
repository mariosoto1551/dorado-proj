import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// PATCH /identity/usuarios/:id — SOLO nombre/avatarId (nunca username en el MVP — spec).
export class EditarUsuarioRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  avatarId?: string;
}
