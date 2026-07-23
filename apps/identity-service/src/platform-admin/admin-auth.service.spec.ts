import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrincipalType } from '@dorado/shared-types';

import {
  CredencialesInvalidasException,
  RefreshTokenInvalidoException,
} from '../comun/excepciones';
import type { PrismaService } from '../prisma/prisma.service';
import type { TokensService } from '../auth/tokens.service';
import { AdminAuthService } from './admin-auth.service';

vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('hash'),
  verify: vi.fn(),
}));

import * as argon2 from 'argon2';

const ADMIN = {
  id: 'admin-1',
  email: 'root@plataforma.com',
  passwordHash: 'hash-guardado',
  nombre: 'Root',
  estado: 'ACTIVO',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function crearMocks(opciones: { admin?: typeof ADMIN | null } = {}) {
  const prisma = {
    client: {
      platformAdmin: {
        findUnique: vi.fn().mockResolvedValue(opciones.admin === undefined ? ADMIN : opciones.admin),
      },
    },
  } as unknown as PrismaService;

  const tokens = {
    emitirAccessToken: vi.fn().mockResolvedValue('access.jwt'),
    emitirRefreshToken: vi.fn().mockResolvedValue({ token: 'refresh', expiraEn: new Date() }),
    consumirRefreshToken: vi.fn(),
  } as unknown as TokensService;

  return { servicio: new AdminAuthService(prisma, tokens), tokens };
}

describe('AdminAuthService — login (fase-14-05)', () => {
  beforeEach(() => {
    vi.mocked(argon2.verify).mockReset();
  });

  it('emite sesión de plataforma con password correcto', async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    const { servicio, tokens } = crearMocks();

    const sesion = await servicio.login({ email: ADMIN.email, password: 'secreta' });

    expect(sesion.accessToken).toBe('access.jwt');
    expect(sesion.perfil.email).toBe(ADMIN.email);
    // El access token de plataforma NO lleva organización.
    expect(tokens.emitirAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        principalType: PrincipalType.PLATFORM_ADMIN,
        organizacionId: '',
        grupoIds: [],
      })
    );
    expect(tokens.emitirRefreshToken).toHaveBeenCalledWith(PrincipalType.PLATFORM_ADMIN, ADMIN.id);
  });

  it('password incorrecto → CREDENCIALES_INVALIDAS (mensaje genérico)', async () => {
    vi.mocked(argon2.verify).mockResolvedValue(false);
    const { servicio } = crearMocks();

    await expect(servicio.login({ email: ADMIN.email, password: 'mala' })).rejects.toBeInstanceOf(
      CredencialesInvalidasException
    );
  });

  it('cuenta inexistente → CREDENCIALES_INVALIDAS', async () => {
    const { servicio } = crearMocks({ admin: null });

    await expect(servicio.login({ email: 'nadie@x.com', password: 'x' })).rejects.toBeInstanceOf(
      CredencialesInvalidasException
    );
  });

  it('cuenta INACTIVA → CREDENCIALES_INVALIDAS aunque el password sea correcto', async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true);
    const { servicio } = crearMocks({ admin: { ...ADMIN, estado: 'INACTIVO' } });

    await expect(servicio.login({ email: ADMIN.email, password: 'secreta' })).rejects.toBeInstanceOf(
      CredencialesInvalidasException
    );
  });
});

describe('AdminAuthService — refresh (fase-14-05)', () => {
  it('rechaza un refresh cuyo principalType no es PLATFORM_ADMIN', async () => {
    const { servicio, tokens } = crearMocks();
    vi.mocked(tokens.consumirRefreshToken).mockResolvedValue({
      id: 'r1',
      principalType: PrincipalType.TUTOR,
      principalId: 'tutor-1',
    } as never);

    await expect(servicio.refrescar('token-tutor')).rejects.toBeInstanceOf(
      RefreshTokenInvalidoException
    );
  });

  it('reemite sesión con un refresh válido de plataforma', async () => {
    const { servicio, tokens } = crearMocks();
    vi.mocked(tokens.consumirRefreshToken).mockResolvedValue({
      id: 'r1',
      principalType: PrincipalType.PLATFORM_ADMIN,
      principalId: ADMIN.id,
    } as never);

    const sesion = await servicio.refrescar('token-admin');

    expect(sesion.accessToken).toBe('access.jwt');
  });

  it('sin token → REFRESH_TOKEN_INVALIDO', async () => {
    const { servicio } = crearMocks();

    await expect(servicio.refrescar(undefined)).rejects.toBeInstanceOf(RefreshTokenInvalidoException);
  });
});
