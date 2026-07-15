import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { PrincipalType, Rol } from '@dorado/shared-types';

import { RequestConTenant, TenantContextGuard } from './tenant-context.guard';

const parDeClaves = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otroParDeClaves = generateKeyPairSync('rsa', { modulusLength: 2048 });

function crearContexto(req: RequestConTenant): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

interface OpcionesToken {
  clave?: KeyObject;
  expiraEnSegundos?: number;
}

async function firmarToken(opciones: OpcionesToken = {}): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);

  return await new SignJWT({
    principalType: PrincipalType.TUTOR,
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: Rol.TUTOR,
    plan: 'FREE',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('tutor-1')
    .setIssuedAt(ahora)
    .setExpirationTime(ahora + (opciones.expiraEnSegundos ?? 3600))
    .sign(opciones.clave ?? parDeClaves.privateKey);
}

describe('TenantContextGuard', () => {
  beforeAll(() => {
    const pemPublico = parDeClaves.publicKey.export({ type: 'spki', format: 'pem' });
    process.env['JWT_PUBLIC_KEY'] = Buffer.from(pemPublico as string).toString('base64');
  });

  it('rechaza con 401 cuando falta el header Authorization', async () => {
    const guard = new TenantContextGuard();
    const contexto = crearContexto({ headers: {} });

    await expect(guard.canActivate(contexto)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza con 401 un token firmado con otra clave (JWT inválido)', async () => {
    const guard = new TenantContextGuard();
    const token = await firmarToken({ clave: otroParDeClaves.privateKey });
    const contexto = crearContexto({ headers: { authorization: `Bearer ${token}` } });

    await expect(guard.canActivate(contexto)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza con 401 un token expirado', async () => {
    const guard = new TenantContextGuard();
    const token = await firmarToken({ expiraEnSegundos: -60 });
    const contexto = crearContexto({ headers: { authorization: `Bearer ${token}` } });

    await expect(guard.canActivate(contexto)).rejects.toThrow(UnauthorizedException);
  });

  it('con un token válido adjunta req.tenant con el contexto completo', async () => {
    const guard = new TenantContextGuard();
    const token = await firmarToken();
    const req: RequestConTenant = { headers: { authorization: `Bearer ${token}` } };

    const resultado = await guard.canActivate(crearContexto(req));

    expect(resultado).toBe(true);
    expect(req.tenant).toEqual({
      organizacionId: 'org-1',
      grupoIds: ['grupo-1'],
      rol: Rol.TUTOR,
      principalId: 'tutor-1',
      principalType: PrincipalType.TUTOR,
    });
  });
});
