import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { PrincipalType, Rol, TenantContext } from '@dorado/shared-types';

import { RolesGuard } from './roles.guard';
import type { RequestConTenant } from './tenant-context.guard';

function crearReflector(roles: Rol[] | undefined): Reflector {
  return {
    getAllAndOverride: () => roles,
  } as unknown as Reflector;
}

function crearContexto(req: RequestConTenant): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function tenantConRol(rol: Rol): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: [],
    rol,
    principalId: 'principal-1',
    principalType: rol === Rol.USUARIO ? PrincipalType.USUARIO : PrincipalType.TUTOR,
  };
}

describe('RolesGuard', () => {
  it('deja pasar cuando el handler no declara @Roles', () => {
    const guard = new RolesGuard(crearReflector(undefined));
    const contexto = crearContexto({ headers: {}, tenant: tenantConRol(Rol.USUARIO) });

    expect(guard.canActivate(contexto)).toBe(true);
  });

  it('rechaza con 401 si TenantContextGuard no corrió antes (sin req.tenant)', () => {
    const guard = new RolesGuard(crearReflector([Rol.TUTOR]));
    const contexto = crearContexto({ headers: {} });

    expect(() => guard.canActivate(contexto)).toThrow(UnauthorizedException);
  });

  it('rechaza con 403 un rol insuficiente', () => {
    const guard = new RolesGuard(crearReflector([Rol.TUTOR, Rol.ORG_ADMIN]));
    const contexto = crearContexto({ headers: {}, tenant: tenantConRol(Rol.USUARIO) });

    expect(() => guard.canActivate(contexto)).toThrow(ForbiddenException);
  });

  it('deja pasar un rol permitido', () => {
    const guard = new RolesGuard(crearReflector([Rol.TUTOR, Rol.ORG_ADMIN]));
    const contexto = crearContexto({ headers: {}, tenant: tenantConRol(Rol.ORG_ADMIN) });

    expect(guard.canActivate(contexto)).toBe(true);
  });
});
