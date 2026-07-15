import { describe, expect, it, vi } from 'vitest';

import type { JwtPayload } from '@dorado/shared-types';

import type { RequestConJwt } from './jwt-validation.middleware';
import { crearTenantHeaderInjector } from './tenant-header-injector.middleware';
import { crearReqFake, crearResFake } from './testing/fakes';

const PAYLOAD: JwtPayload = {
  sub: 'tutor-1',
  principalType: 'TUTOR',
  organizacionId: 'org-1',
  grupoIds: ['g-1', 'g-2'],
  rol: 'ORG_ADMIN',
  plan: 'FREE',
  iat: 0,
  exp: 0,
} as unknown as JwtPayload;

describe('crearTenantHeaderInjector', () => {
  it('borra headers de tenant spoofeados aunque no haya sesión (anti-spoofing)', () => {
    const middleware = crearTenantHeaderInjector(() => 'secreto');
    const req = crearReqFake({
      url: '/api/auth/login',
      headers: {
        'x-organizacion-id': 'org-ajena',
        'x-rol': 'PLATFORM_ADMIN',
        'x-internal-secret': 'adivinado',
      },
    });
    const next = vi.fn();

    middleware(req, crearResFake(), next);

    expect(req.headers['x-organizacion-id']).toBeUndefined();
    expect(req.headers['x-rol']).toBeUndefined();
    expect(req.headers['x-internal-secret']).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('con JWT válido inyecta el contexto de tenant y el secreto interno', () => {
    const middleware = crearTenantHeaderInjector(() => 'secreto-interno');
    const req = crearReqFake({
      url: '/api/identity/me',
      // Aunque el cliente mande headers falsos, se pisan con los del payload.
      headers: { 'x-organizacion-id': 'org-ajena', 'x-grupo-ids': 'g-999' },
    }) as RequestConJwt;

    req.jwtPayload = PAYLOAD;

    const next = vi.fn();

    middleware(req, crearResFake(), next);

    expect(req.headers['x-organizacion-id']).toBe('org-1');
    expect(req.headers['x-grupo-ids']).toBe('g-1,g-2');
    expect(req.headers['x-rol']).toBe('ORG_ADMIN');
    expect(req.headers['x-principal-id']).toBe('tutor-1');
    expect(req.headers['x-principal-type']).toBe('TUTOR');
    expect(req.headers['x-internal-secret']).toBe('secreto-interno');
    expect(next).toHaveBeenCalledOnce();
  });
});
