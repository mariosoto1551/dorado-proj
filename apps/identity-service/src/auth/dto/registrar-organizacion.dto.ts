import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

import type { OrganizacionDto, TutorDto } from '@dorado/shared-types';

// POST /auth/organizaciones — auto-registro de organización (fase-02).
// `nombre` es el nombre de la Organización; el Tutor ORG_ADMIN creado toma el
// mismo nombre (la spec no pide un nombre de tutor aparte — hueco documentado
// en docs/progreso/fase-02-identity.md).
export class RegistrarOrganizacionRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsEmail()
  emailContacto!: string;

  // Mínimo 8 caracteres, sin complejidad adicional en el MVP (spec fase-02).
  @IsString()
  @MinLength(8)
  password!: string;
}

export interface RegistrarOrganizacionResponse {
  accessToken: string;
  tutor: TutorDto;
  organizacion: OrganizacionDto;
}
