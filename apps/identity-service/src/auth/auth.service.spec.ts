import { describe, expect, it, vi } from 'vitest';

import type { BillingClientService } from '../billing/billing-client.service';
import { OrganizacionSuspendidaException } from '../comun/excepciones';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import type { TokensService } from './tokens.service';

function crearServicio(estadoOrg: 'ACTIVA' | 'SUSPENDIDA') {
  const prisma = {
    client: {
      organizacion: {
        findFirst: vi.fn().mockResolvedValue({ id: 'org-1', estado: estadoOrg }),
      },
      tutorGrupo: { findMany: vi.fn().mockResolvedValue([]) },
    },
  } as unknown as PrismaService;

  const tokens = {
    emitirAccessToken: vi.fn().mockResolvedValue('access.jwt'),
    emitirRefreshToken: vi.fn().mockResolvedValue({ token: 'r', expiraEn: new Date() }),
  } as unknown as TokensService;

  const billing = {
    resolvePlan: vi.fn().mockResolvedValue('FREE'),
  } as unknown as BillingClientService;

  const eventos = { publicar: vi.fn() } as unknown as EventosPublisherService;

  return new AuthService(prisma, tokens, billing, eventos);
}

const TUTOR = {
  id: 'tutor-1',
  organizacionId: 'org-1',
  email: 't@x.com',
  passwordHash: 'h',
  nombre: 'T',
  rol: 'ORG_ADMIN',
  estado: 'ACTIVO',
  createdAt: new Date(),
  updatedAt: new Date(),
} as never;

describe('AuthService — organización suspendida (fase-14-05)', () => {
  it('no emite sesión de un tutor si su organización está SUSPENDIDA', async () => {
    const servicio = crearServicio('SUSPENDIDA');

    await expect(servicio.emitirSesionTutor(TUTOR)).rejects.toBeInstanceOf(
      OrganizacionSuspendidaException
    );
  });

  it('emite sesión normal si la organización está ACTIVA', async () => {
    const servicio = crearServicio('ACTIVA');

    const sesion = await servicio.emitirSesionTutor(TUTOR);

    expect(sesion.accessToken).toBe('access.jwt');
  });
});
