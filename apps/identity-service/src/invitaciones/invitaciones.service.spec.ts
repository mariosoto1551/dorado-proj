import { describe, expect, it, vi } from 'vitest';

import { DomainException } from '@dorado/shared-auth';
import type { EntitlementsDto } from '@dorado/shared-types';

import type { AuthService } from '../auth/auth.service';
import type { BillingClientService } from '../billing/billing-client.service';
import type { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  InvitacionNoCanjeableException,
  InvitacionNoEncontradaException,
  LimitePlanAlcanzadoException,
} from '../comun/excepciones';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Invitacion } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { InvitacionesService } from './invitaciones.service';

const ENTITLEMENTS_FREE: EntitlementsDto = {
  plan: 'FREE',
  limites: { tutores: 2, usuarios: 5, grupos: 1, actividadesPorGrupo: 15 },
  features: { whiteLabel: false, reportesAvanzados: false },
} as EntitlementsDto;

function invitacionDePrueba(sobrescribir: Partial<Invitacion> = {}): Invitacion {
  return {
    id: 'inv-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    tipoInvitado: 'USUARIO',
    codigo: 'ABCD2345',
    creadoPorTutorId: 'tutor-1',
    estado: 'PENDIENTE',
    expiraEn: new Date(Date.now() + 60 * 60 * 1000),
    canjeadaPorId: null,
    canjeadaEn: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...sobrescribir,
  } as Invitacion;
}

interface MocksPrisma {
  prisma: PrismaService;
  updateMany: ReturnType<typeof vi.fn>;
}

function crearPrismaMock(
  invitacion: Invitacion | null,
  cuentasActivas: { tutores?: number; usuarios?: number } = {}
): MocksPrisma {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });

  const tx = {
    tutor: { create: vi.fn().mockResolvedValue({ id: 'tutor-nuevo' }) },
    tutorGrupo: { create: vi.fn().mockResolvedValue({}) },
    usuario: { create: vi.fn().mockResolvedValue({ id: 'usuario-nuevo', nombre: 'Ana' }) },
    usuarioGrupo: { create: vi.fn().mockResolvedValue({}) },
    invitacion: { updateMany },
  };

  const prisma = {
    client: {
      invitacion: {
        findFirst: vi.fn().mockResolvedValue(invitacion),
        updateMany,
      },
      grupo: {
        findFirst: vi.fn().mockResolvedValue({ id: 'grupo-1', nombre: 'Grupo Uno' }),
      },
      organizacion: {
        findFirst: vi.fn().mockResolvedValue({ id: 'org-1', nombre: 'Org Uno' }),
      },
      tutor: {
        count: vi.fn().mockResolvedValue(cuentasActivas.tutores ?? 0),
      },
      usuario: {
        count: vi.fn().mockResolvedValue(cuentasActivas.usuarios ?? 0),
      },
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    },
  } as unknown as PrismaService;

  return { prisma, updateMany };
}

function crearServicio(
  prisma: PrismaService,
  entitlements: EntitlementsDto | null = null
): InvitacionesService {
  const accesoGrupo = { asegurarAcceso: vi.fn() } as unknown as AccesoGrupoService;
  const auth = {
    emitirSesionTutor: vi.fn(),
    emitirSesionUsuario: vi.fn(),
    traducirErrorUnicidad: (error: unknown) => error as Error,
  } as unknown as AuthService;
  const eventos = {
    publicar: vi.fn(),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;
  const billing = {
    resolveEntitlements: vi.fn().mockResolvedValue(entitlements),
  } as unknown as BillingClientService;

  return new InvitacionesService(prisma, accesoGrupo, auth, eventos, billing);
}

describe('InvitacionesService — reglas de invitación vencida (spec fase-02)', () => {
  it('404 si el código no existe', async () => {
    const { prisma } = crearPrismaMock(null);
    const servicio = crearServicio(prisma);

    await expect(servicio.preview('NOEXISTE')).rejects.toThrow(
      InvitacionNoEncontradaException
    );
  });

  it('410 si la invitación está REVOCADA (sin tocar la base)', async () => {
    const { prisma, updateMany } = crearPrismaMock(
      invitacionDePrueba({ estado: 'REVOCADA' })
    );
    const servicio = crearServicio(prisma);

    await expect(servicio.canjear('ABCD2345', { nombre: 'Ana', password: '12345678' }))
      .rejects.toThrow(InvitacionNoCanjeableException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('410 si ya fue CANJEADA', async () => {
    const { prisma } = crearPrismaMock(invitacionDePrueba({ estado: 'CANJEADA' }));
    const servicio = crearServicio(prisma);

    await expect(servicio.preview('ABCD2345')).rejects.toThrow(
      InvitacionNoCanjeableException
    );
  });

  it('una PENDIENTE ya vencida devuelve 410 Y se marca EXPIRADA en el mismo request', async () => {
    const vencida = invitacionDePrueba({
      expiraEn: new Date(Date.now() - 60 * 1000),
    });
    const { prisma, updateMany } = crearPrismaMock(vencida);
    const servicio = crearServicio(prisma);

    let capturada: unknown;

    try {
      await servicio.canjear('ABCD2345', {
        nombre: 'Ana',
        password: '12345678',
        username: 'ana.123',
      });
    } catch (error) {
      capturada = error;
    }

    expect(capturada).toBeInstanceOf(InvitacionNoCanjeableException);
    expect((capturada as DomainException).getStatus()).toBe(410);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { estado: 'EXPIRADA' },
    });
  });

  it('403 LIMITE_PLAN_ALCANZADO (recurso usuarios) si el plan ya no admite más usuarios', async () => {
    const { prisma, updateMany } = crearPrismaMock(invitacionDePrueba(), { usuarios: 5 });
    const servicio = crearServicio(prisma, ENTITLEMENTS_FREE);

    let capturada: unknown;

    try {
      await servicio.canjear('ABCD2345', {
        nombre: 'Ana',
        password: '12345678',
        username: 'ana.123',
      });
    } catch (error) {
      capturada = error;
    }

    expect(capturada).toBeInstanceOf(LimitePlanAlcanzadoException);
    expect((capturada as LimitePlanAlcanzadoException).getStatus()).toBe(403);
    expect((capturada as LimitePlanAlcanzadoException).extras).toEqual({ recurso: 'usuarios' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('el canje procede bajo el límite (4 de 5 usuarios activos)', async () => {
    const { prisma, updateMany } = crearPrismaMock(invitacionDePrueba(), { usuarios: 4 });
    const servicio = crearServicio(prisma, ENTITLEMENTS_FREE);

    await servicio.canjear('ABCD2345', {
      nombre: 'Ana',
      password: '12345678',
      username: 'ana.123',
    });

    expect(updateMany).toHaveBeenCalled();
  });

  it('si billing no está disponible el canje NO se bloquea por límite', async () => {
    const { prisma, updateMany } = crearPrismaMock(invitacionDePrueba(), { usuarios: 99 });
    const servicio = crearServicio(prisma, null);

    await servicio.canjear('ABCD2345', {
      nombre: 'Ana',
      password: '12345678',
      username: 'ana.123',
    });

    expect(updateMany).toHaveBeenCalled();
  });

  it('el preview de una invitación vigente devuelve los datos públicos', async () => {
    const { prisma } = crearPrismaMock(invitacionDePrueba());
    const servicio = crearServicio(prisma);

    const preview = await servicio.preview('ABCD2345');

    expect(preview).toEqual({
      grupoNombre: 'Grupo Uno',
      organizacionNombre: 'Org Uno',
      tipoInvitado: 'USUARIO',
      expiraEn: expect.any(String),
      estado: 'PENDIENTE',
    });
  });
});
