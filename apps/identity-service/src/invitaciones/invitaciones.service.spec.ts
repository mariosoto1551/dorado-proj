import { describe, expect, it, vi } from 'vitest';

import { DomainException } from '@dorado/shared-auth';

import type { AuthService } from '../auth/auth.service';
import type { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  InvitacionNoCanjeableException,
  InvitacionNoEncontradaException,
} from '../comun/excepciones';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Invitacion } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { InvitacionesService } from './invitaciones.service';

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

function crearPrismaMock(invitacion: Invitacion | null): MocksPrisma {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });

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
    },
  } as unknown as PrismaService;

  return { prisma, updateMany };
}

function crearServicio(prisma: PrismaService): InvitacionesService {
  const accesoGrupo = { asegurarAcceso: vi.fn() } as unknown as AccesoGrupoService;
  const auth = {
    emitirSesionTutor: vi.fn(),
    emitirSesionUsuario: vi.fn(),
    traducirErrorUnicidad: (error: unknown) => error as Error,
  } as unknown as AuthService;
  const eventos = { publicar: vi.fn() } as unknown as EventosPublisherService;

  return new InvitacionesService(prisma, accesoGrupo, auth, eventos);
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
