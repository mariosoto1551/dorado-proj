import { CodigoPlan } from './billing';

export enum Rol {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  ORG_ADMIN = 'ORG_ADMIN',
  TUTOR = 'TUTOR',
  USUARIO = 'USUARIO',
}

export enum PrincipalType {
  TUTOR = 'TUTOR',
  USUARIO = 'USUARIO',
}

export interface JwtPayload {
  sub: string;
  principalType: PrincipalType;
  organizacionId: string;
  grupoIds: string[];
  rol: Rol;
  plan: CodigoPlan;
  iat: number;
  exp: number;
}

export interface TenantContext {
  organizacionId: string;
  grupoIds: string[];
  rol: Rol;
  principalId: string;
  principalType: PrincipalType;
}
