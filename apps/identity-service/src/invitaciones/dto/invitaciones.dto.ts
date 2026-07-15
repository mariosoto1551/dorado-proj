import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { TipoInvitado } from '@dorado/shared-types';

// POST /identity/grupos/:grupoId/invitaciones
export class CrearInvitacionRequest {
  @IsEnum(TipoInvitado)
  tipoInvitado!: TipoInvitado;
}

// GET /auth/invitaciones/:codigo — preview público (spec fase-02).
export interface PreviewInvitacionResponse {
  grupoNombre: string;
  organizacionNombre: string;
  tipoInvitado: TipoInvitado;
  expiraEn: string;
  estado: string;
}

// POST /auth/invitaciones/:codigo/canjear
export class CanjearInvitacionRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // Requerido si tipoInvitado=TUTOR (se valida en el servicio, depende de la invitación).
  @IsOptional()
  @IsEmail()
  email?: string;

  // Requerido si tipoInvitado=USUARIO.
  @IsOptional()
  @Matches(/^[a-zA-Z0-9._-]{3,30}$/, {
    message: 'username: 3-30 caracteres alfanuméricos, punto, guion o guion bajo',
  })
  username?: string;
}
