import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';

import { CodigoPlan, EstadoOrganizacion } from '@dorado/shared-types';

// POST /auth/admin/login (fase-14-05).
export class AdminLoginRequest {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

// POST /admin/organizaciones/:id/plan
export class AdminCambiarPlanRequest {
  @IsEnum(CodigoPlan)
  plan!: CodigoPlan;
}

// POST /admin/organizaciones/:id/estado
export class AdminCambiarEstadoOrgRequest {
  @IsEnum(EstadoOrganizacion)
  estado!: EstadoOrganizacion;
}
