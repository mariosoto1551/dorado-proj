import type { ExecutionContext } from '@nestjs/common';
import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';

import { InternalSecretGuard } from './internal-secret.guard';
import type { RequestConTenant } from './tenant-context.guard';

const SECRETO = 'secreto-interno-de-prueba-123';

function crearContexto(headers: RequestConTenant['headers']): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('InternalSecretGuard', () => {
  afterEach(() => {
    delete process.env['GATEWAY_INTERNAL_SECRET'];
  });

  it('deja pasar cuando el header coincide con GATEWAY_INTERNAL_SECRET', () => {
    process.env['GATEWAY_INTERNAL_SECRET'] = SECRETO;
    const guard = new InternalSecretGuard();

    expect(guard.canActivate(crearContexto({ 'x-internal-secret': SECRETO }))).toBe(true);
  });

  it('rechaza con 401 un secreto incorrecto', () => {
    process.env['GATEWAY_INTERNAL_SECRET'] = SECRETO;
    const guard = new InternalSecretGuard();

    expect(() =>
      guard.canActivate(crearContexto({ 'x-internal-secret': 'otro-valor' }))
    ).toThrow(UnauthorizedException);
  });

  it('rechaza con 401 cuando falta el header', () => {
    process.env['GATEWAY_INTERNAL_SECRET'] = SECRETO;
    const guard = new InternalSecretGuard();

    expect(() => guard.canActivate(crearContexto({}))).toThrow(UnauthorizedException);
  });

  it('falla con 500 si el servicio no tiene GATEWAY_INTERNAL_SECRET configurado', () => {
    const guard = new InternalSecretGuard();

    expect(() => guard.canActivate(crearContexto({ 'x-internal-secret': SECRETO }))).toThrow(
      InternalServerErrorException
    );
  });
});
