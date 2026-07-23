import { describe, expect, it, vi } from 'vitest';

import { CodigoPlan, EstadoOrganizacion, type SuscripcionDto } from '@dorado/shared-types';

import type { BillingClientService } from '../billing/billing-client.service';
import { OrganizacionNoEncontradaException } from '../comun/excepciones';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

function orgFila(id: string, nombre: string, estado: EstadoOrganizacion = EstadoOrganizacion.ACTIVA) {
  return {
    id,
    nombre,
    emailContacto: `${id}@x.com`,
    estado,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function suscripcion(plan: CodigoPlan): SuscripcionDto {
  return {
    id: 'sus-1',
    organizacionId: 'org-1',
    planId: 'plan-1',
    plan,
    estado: 'ACTIVA',
    fuente: 'MANUAL',
  };
}

function crearMocks(overrides: {
  organizaciones?: ReturnType<typeof orgFila>[];
  grupos?: { organizacionId: string; _count: { _all: number } }[];
  tutores?: { organizacionId: string; _count: { _all: number } }[];
  usuarios?: { organizacionId: string; _count: { _all: number } }[];
  planPorOrg?: Record<string, CodigoPlan>;
  organizacionUnica?: ReturnType<typeof orgFila> | null;
} = {}) {
  const prisma = {
    client: {
      organizacion: {
        findMany: vi.fn().mockResolvedValue(overrides.organizaciones ?? []),
        findUnique: vi
          .fn()
          .mockResolvedValue(
            overrides.organizacionUnica === undefined ? orgFila('org-1', 'Uno') : overrides.organizacionUnica
          ),
        update: vi.fn().mockImplementation(({ data }) => ({ ...orgFila('org-1', 'Uno'), ...data })),
      },
      grupo: {
        groupBy: vi.fn().mockResolvedValue(overrides.grupos ?? []),
        findMany: vi.fn().mockResolvedValue([]),
      },
      tutor: {
        groupBy: vi.fn().mockResolvedValue(overrides.tutores ?? []),
        count: vi.fn().mockResolvedValue(0),
      },
      usuario: {
        groupBy: vi.fn().mockResolvedValue(overrides.usuarios ?? []),
        count: vi.fn().mockResolvedValue(0),
      },
    },
  } as unknown as PrismaService;

  const billing = {
    resolvePlan: vi
      .fn()
      .mockImplementation((id: string) => overrides.planPorOrg?.[id] ?? CodigoPlan.FREE),
    obtenerSuscripcion: vi.fn().mockResolvedValue(suscripcion(CodigoPlan.PRO)),
    cambiarPlan: vi.fn().mockResolvedValue(suscripcion(CodigoPlan.PRO)),
  } as unknown as BillingClientService;

  const eventos = {
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  return { servicio: new AdminService(prisma, billing, eventos), prisma, billing, eventos };
}

describe('AdminService — listar organizaciones (fase-14-05)', () => {
  it('adjunta conteos por org y plan resuelto vía billing', async () => {
    const { servicio } = crearMocks({
      organizaciones: [orgFila('org-1', 'Uno'), orgFila('org-2', 'Dos')],
      grupos: [{ organizacionId: 'org-1', _count: { _all: 3 } }],
      tutores: [{ organizacionId: 'org-1', _count: { _all: 2 } }],
      usuarios: [{ organizacionId: 'org-2', _count: { _all: 5 } }],
      planPorOrg: { 'org-1': CodigoPlan.PRO, 'org-2': CodigoPlan.FREE },
    });

    const res = await servicio.listarOrganizaciones({ page: 1, pageSize: 20 });

    expect(res.total).toBe(2);
    const uno = res.items.find((i) => i.id === 'org-1');
    expect(uno).toMatchObject({ plan: CodigoPlan.PRO, cantidadGrupos: 3, cantidadTutores: 2, cantidadUsuarios: 0 });
    const dos = res.items.find((i) => i.id === 'org-2');
    expect(dos).toMatchObject({ plan: CodigoPlan.FREE, cantidadUsuarios: 5, cantidadGrupos: 0 });
  });

  it('filtra por plan (resuelto en memoria) y pagina', async () => {
    const { servicio } = crearMocks({
      organizaciones: [orgFila('org-1', 'Uno'), orgFila('org-2', 'Dos'), orgFila('org-3', 'Tres')],
      planPorOrg: { 'org-1': CodigoPlan.PRO, 'org-2': CodigoPlan.FREE, 'org-3': CodigoPlan.PRO },
    });

    const res = await servicio.listarOrganizaciones({ plan: CodigoPlan.PRO, page: 1, pageSize: 1 });

    expect(res.total).toBe(2); // solo las PRO
    expect(res.items).toHaveLength(1); // pageSize=1
    expect(res.items[0].plan).toBe(CodigoPlan.PRO);
  });
});

describe('AdminService — cambiar plan (fase-14-05)', () => {
  it('llama a billing y audita PLAN_CAMBIADO con actorTipo PLATFORM_ADMIN', async () => {
    const { servicio, billing, eventos } = crearMocks({ planPorOrg: { 'org-1': CodigoPlan.FREE } });

    const res = await servicio.cambiarPlan('org-1', CodigoPlan.PRO, 'admin-1');

    expect(billing.cambiarPlan).toHaveBeenCalledWith('org-1', CodigoPlan.PRO);
    expect(res.suscripcion.plan).toBe(CodigoPlan.PRO);
    expect(eventos.publicarAccionAdministrativa).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'PLAN_CAMBIADO',
        actorTipo: 'PLATFORM_ADMIN',
        actorId: 'admin-1',
        entidadId: 'org-1',
        detalle: { de: CodigoPlan.FREE, a: CodigoPlan.PRO },
      })
    );
  });

  it('404 si la organización no existe', async () => {
    const { servicio } = crearMocks({ organizacionUnica: null });

    await expect(servicio.cambiarPlan('org-x', CodigoPlan.PRO, 'admin-1')).rejects.toBeInstanceOf(
      OrganizacionNoEncontradaException
    );
  });
});

describe('AdminService — cambiar estado (fase-14-05)', () => {
  it('suspender actualiza el estado y audita ORG_SUSPENDIDA', async () => {
    const { servicio, eventos } = crearMocks();

    const res = await servicio.cambiarEstado('org-1', EstadoOrganizacion.SUSPENDIDA, 'admin-1');

    expect(res.organizacion.estado).toBe(EstadoOrganizacion.SUSPENDIDA);
    expect(eventos.publicarAccionAdministrativa).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'ORG_SUSPENDIDA', actorTipo: 'PLATFORM_ADMIN' })
    );
  });

  it('reactivar audita ORG_REACTIVADA', async () => {
    const { servicio, eventos } = crearMocks({
      organizacionUnica: orgFila('org-1', 'Uno', EstadoOrganizacion.SUSPENDIDA),
    });

    await servicio.cambiarEstado('org-1', EstadoOrganizacion.ACTIVA, 'admin-1');

    expect(eventos.publicarAccionAdministrativa).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'ORG_REACTIVADA' })
    );
  });
});

describe('AdminService — detalle (fase-14-05)', () => {
  it('404 si no existe', async () => {
    const { servicio } = crearMocks({ organizacionUnica: null });

    await expect(servicio.detalleOrganizacion('org-x')).rejects.toBeInstanceOf(
      OrganizacionNoEncontradaException
    );
  });

  it('arma el detalle con plan/suscripción de billing y conteos', async () => {
    const { servicio } = crearMocks();

    const detalle = await servicio.detalleOrganizacion('org-1');

    expect(detalle.plan).toBe(CodigoPlan.PRO);
    expect(detalle.suscripcion.plan).toBe(CodigoPlan.PRO);
    expect(detalle.historialAdministrativo).toEqual([]); // diferido en este corte
  });
});
