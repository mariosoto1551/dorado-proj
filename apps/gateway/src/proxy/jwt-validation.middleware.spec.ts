import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  crearJwtValidationMiddleware,
  esRutaPublica,
  type RequestConJwt,
} from './jwt-validation.middleware';
import { crearReqFake, crearResFake } from './testing/fakes';

describe('esRutaPublica', () => {
  it.each([
    ['POST', '/api/auth/organizaciones'],
    ['POST', '/api/auth/login'],
    ['POST', '/api/auth/refresh'],
    ['GET', '/api/auth/invitaciones/ABC123'],
    ['POST', '/api/auth/invitaciones/ABC123/canjear'],
    ['GET', '/api/health'],
  ])('%s %s es pública', (metodo, path) => {
    expect(esRutaPublica(metodo, path)).toBe(true);
  });

  it.each([
    ['GET', '/api/identity/me'],
    ['POST', '/api/identity/grupos'],
    ['GET', '/api/auth/invitaciones/ABC123/otra-cosa'],
    ['POST', '/api/auth/logout'],
    ['GET', '/api/auth/login'],
  ])('%s %s NO es pública', (metodo, path) => {
    expect(esRutaPublica(metodo, path)).toBe(false);
  });
});

describe('crearJwtValidationMiddleware', () => {
  let clavePrivada: CryptoKey;

  beforeAll(async () => {
    const par = await generateKeyPair('RS256', { extractable: true });

    clavePrivada = par.privateKey;
    process.env['JWT_PUBLIC_KEY'] = Buffer.from(await exportSPKI(par.publicKey)).toString(
      'base64'
    );
  });

  async function firmarToken(expiraEn = '2h'): Promise<string> {
    return await new SignJWT({
      principalType: 'TUTOR',
      organizacionId: 'org-1',
      grupoIds: ['g-1', 'g-2'],
      rol: 'ORG_ADMIN',
      plan: 'FREE',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('tutor-1')
      .setIssuedAt()
      .setExpirationTime(expiraEn)
      .sign(clavePrivada);
  }

  it('deja pasar una ruta pública sin token', async () => {
    const middleware = crearJwtValidationMiddleware();
    const req = crearReqFake({ method: 'POST', url: '/api/auth/login' });
    const res = crearResFake();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('deja pasar paths fuera de /api (los resuelve el router de Nest)', async () => {
    const middleware = crearJwtValidationMiddleware();
    const req = crearReqFake({ method: 'GET', url: '/cualquier-cosa' });
    const res = crearResFake();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('responde 401 NO_AUTENTICADO si falta el header Authorization', async () => {
    const middleware = crearJwtValidationMiddleware();
    const req = crearReqFake({ method: 'GET', url: '/api/identity/me' });
    const res = crearResFake();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.cuerpoJson()).toMatchObject({ statusCode: 401, code: 'NO_AUTENTICADO' });
  });

  it('responde 401 con un token inválido', async () => {
    const middleware = crearJwtValidationMiddleware();
    const req = crearReqFake({
      method: 'GET',
      url: '/api/identity/me',
      headers: { authorization: 'Bearer no-es-un-jwt' },
    });
    const res = crearResFake();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.cuerpoJson()).toMatchObject({ code: 'NO_AUTENTICADO' });
  });

  it('responde 401 con un token expirado', async () => {
    const middleware = crearJwtValidationMiddleware();
    const token = await firmarToken('-1s');
    const req = crearReqFake({
      method: 'GET',
      url: '/api/identity/me',
      headers: { authorization: `Bearer ${token}` },
    });
    const res = crearResFake();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('con token válido adjunta el payload y sigue la cadena', async () => {
    const middleware = crearJwtValidationMiddleware();
    const token = await firmarToken();
    const req = crearReqFake({
      method: 'GET',
      url: '/api/identity/me?x=1',
      headers: { authorization: `Bearer ${token}` },
    });
    const res = crearResFake();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as RequestConJwt).jwtPayload).toMatchObject({
      sub: 'tutor-1',
      organizacionId: 'org-1',
      rol: 'ORG_ADMIN',
    });
  });
});
