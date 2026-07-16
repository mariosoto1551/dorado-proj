import { describe, expect, it } from 'vitest';

import { PrincipalType, Rol, type TenantContext } from '@dorado/shared-types';

import {
  getTenantContext,
  setTenantContext,
  tenantScopeMiddleware,
} from './tenant.storage';

const TENANT: TenantContext = {
  organizacionId: 'org-1',
  grupoIds: ['grupo-1'],
  rol: Rol.TUTOR,
  principalId: 'tutor-1',
  principalType: PrincipalType.TUTOR,
};

/** Ejecuta `fn` dentro del scope del middleware, como un request real. */
function dentroDelScope(fn: () => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    tenantScopeMiddleware(
      {} as never,
      {} as never,
      () => void fn().then(resolve, reject)
    );
  });
}

describe('tenantScopeMiddleware + setTenantContext', () => {
  it('el contexto seteado en un guard ASYNC sobrevive a la continuación del llamador (regresión fase-05)', async () => {
    await dentroDelScope(async () => {
      // Simula NestJS: el guard es una función async que se await-ea; el set
      // ocurre después de un await interno (como jwtVerify), es decir en un
      // async resource HIJO. Con enterWith esto se perdía y Prisma no filtraba.
      const guardAsync = async (): Promise<void> => {
        await Promise.resolve();
        setTenantContext(TENANT);
      };

      await guardAsync();

      // La continuación del "handler" (este punto) debe seguir viendo el tenant.
      expect(getTenantContext()).toEqual(TENANT);

      // Y también un query Prisma disparado más tarde en la cadena async.
      await new Promise((r) => setTimeout(r, 0));
      expect(getTenantContext()).toEqual(TENANT);
    });
  });

  it('sin setTenantContext el scope existe pero el tenant es undefined (rutas internas)', async () => {
    await dentroDelScope(async () => {
      expect(getTenantContext()).toBeUndefined();
    });
  });

  it('dos scopes concurrentes no se contaminan entre sí', async () => {
    const otroTenant = { ...TENANT, organizacionId: 'org-2' };

    await Promise.all([
      dentroDelScope(async () => {
        setTenantContext(TENANT);
        await new Promise((r) => setTimeout(r, 5));
        expect(getTenantContext()?.organizacionId).toBe('org-1');
      }),
      dentroDelScope(async () => {
        setTenantContext(otroTenant);
        await new Promise((r) => setTimeout(r, 1));
        expect(getTenantContext()?.organizacionId).toBe('org-2');
      }),
    ]);
  });

  it('fuera de todo scope, setTenantContext hace fallback a enterWith (mismo async resource)', () => {
    setTenantContext(TENANT);

    expect(getTenantContext()).toEqual(TENANT);
  });
});
