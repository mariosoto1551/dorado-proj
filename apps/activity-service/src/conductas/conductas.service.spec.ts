import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { TenantContext } from '@dorado/shared-types';

import type { AccesoGrupoService } from '../comun/acceso-grupo.service';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Conducta } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConductasService } from './conductas.service';

const CONDUCTA_BASE: Conducta = {
  id: 'con-1',
  organizacionId: 'org-1',
  grupoId: 'grupo-1',
  nombre: 'Interrumpir',
  tipo: 'MALA',
  valorPuntos: 5,
  permiteAutoreporte: true,
  estado: 'ACTIVA',
  creadaPorTutorId: 'tutor-1',
  createdAt: new Date(),
  updatedAt: new Date(),
} as Conducta;

function tenantDePrueba(sobrescribir: Partial<TenantContext> = {}): TenantContext {
  return {
    organizacionId: 'org-1',
    grupoIds: ['grupo-1'],
    rol: 'TUTOR',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
    ...sobrescribir,
  } as TenantContext;
}

function crearServicio(existente: Conducta | null = null) {
  const crear = vi
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...CONDUCTA_BASE, ...data })
    );
  const actualizar = vi.fn().mockResolvedValue({ count: 1 });
  const buscarPrimera = vi.fn().mockResolvedValue(existente);
  const listarFilas = vi.fn().mockResolvedValue([CONDUCTA_BASE]);

  const prisma = {
    client: {
      conducta: {
        create: crear,
        updateMany: actualizar,
        findFirst: buscarPrimera,
        findMany: listarFilas,
      },
    },
  } as unknown as PrismaService;

  const acceso = {
    asegurarAccesoEscritura: vi.fn().mockResolvedValue(undefined),
    asegurarAccesoLectura: vi.fn(),
  } as unknown as AccesoGrupoService;
  const eventos = {
    publicar: vi.fn(),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  return {
    servicio: new ConductasService(prisma, acceso, eventos),
    crear,
    actualizar,
    listarFilas,
  };
}

describe('ConductasService — regla de autoreporte (spec fase-05)', () => {
  it('BUENA fuerza permiteAutoreporte=false aunque el request mande true', async () => {
    const { servicio, crear } = crearServicio();

    await servicio.crear(tenantDePrueba(), 'grupo-1', {
      nombre: 'Ayudar sin que se pida',
      tipo: 'BUENA',
      valorPuntos: 5,
      permiteAutoreporte: true,
    });

    expect(crear).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: 'BUENA', permiteAutoreporte: false }),
    });
  });

  it('MALA respeta permiteAutoreporte=true (autoreporte de mala conducta, arquitectura 4.2)', async () => {
    const { servicio, crear } = crearServicio();

    await servicio.crear(tenantDePrueba(), 'grupo-1', {
      nombre: 'Interrumpir',
      tipo: 'MALA',
      valorPuntos: 5,
      permiteAutoreporte: true,
    });

    expect(crear).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: 'MALA', permiteAutoreporte: true }),
    });
  });

  it('editar MALA→BUENA fuerza permiteAutoreporte=false aunque estaba en true', async () => {
    const { servicio, actualizar } = crearServicio(CONDUCTA_BASE);

    await servicio.editar(tenantDePrueba(), 'con-1', { tipo: 'BUENA' });

    expect(actualizar).toHaveBeenCalledWith({
      where: { id: 'con-1' },
      data: expect.objectContaining({ tipo: 'BUENA', permiteAutoreporte: false }),
    });
  });

  it('sin permiteAutoreporte en el request, MALA defaultea a false', async () => {
    const { servicio, crear } = crearServicio();

    await servicio.crear(tenantDePrueba(), 'grupo-1', {
      nombre: 'Interrumpir',
      tipo: 'MALA',
      valorPuntos: 5,
    });

    expect(crear).toHaveBeenCalledWith({
      data: expect.objectContaining({ permiteAutoreporte: false }),
    });
  });
});

describe('ConductasService — visibilidad y archivo (spec fase-05)', () => {
  it('USUARIO solo ve ACTIVA aunque pida ?estado=ARCHIVADA (param ignorado)', async () => {
    const { servicio, listarFilas } = crearServicio();
    const usuario = tenantDePrueba({
      rol: 'USUARIO',
      principalType: 'USUARIO',
    } as Partial<TenantContext>);

    await servicio.listar(usuario, 'grupo-1', { estado: 'ARCHIVADA' });

    expect(listarFilas).toHaveBeenCalledWith({
      where: { grupoId: 'grupo-1', estado: 'ACTIVA' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('archivar hace soft delete (estado ARCHIVADA)', async () => {
    const { servicio, actualizar } = crearServicio(CONDUCTA_BASE);

    const resultado = await servicio.archivar(tenantDePrueba(), 'con-1');

    expect(actualizar).toHaveBeenCalledWith({
      where: { id: 'con-1' },
      data: { estado: 'ARCHIVADA' },
    });
    expect(resultado.estado).toBe('ARCHIVADA');
  });

  it('editar una conducta inaccesible (otro tenant/grupo) es 404', async () => {
    const { servicio } = crearServicio(null);

    await expect(
      servicio.editar(tenantDePrueba(), 'con-ajena', { nombre: 'X' })
    ).rejects.toThrow(NotFoundException);
  });
});
