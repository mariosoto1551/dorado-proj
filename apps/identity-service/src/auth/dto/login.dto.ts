import { IsNotEmpty, IsString } from 'class-validator';

import type { PrincipalType, TutorDto, UsuarioDto } from '@dorado/shared-types';

// POST /auth/login — busca Tutor.email y si no existe, Usuario.username (fase-02).
export class LoginRequest {
  @IsString()
  @IsNotEmpty()
  identificador!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export interface LoginResponse {
  accessToken: string;
  principalType: PrincipalType;
  perfil: TutorDto | UsuarioDto;
}
