import { describe, expect, it, vi } from 'vitest';

import type { EventEnvelope, OrganizacionCreadaPayload } from '@dorado/shared-events';
import type { TenantContext } from '@dorado/shared-types';

import { SuscripcionNoEncontradaException } from '../comun/excepciones';
import type { Plan } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { SuscripcionesService } from './suscripciones.service';

const PLAN_FREE: Plan = {
  id: 'plan-free',
  codigo: 'FREE',
  nombre: 'Free',
  limiteTutores: 2,
  limiteUsuarios: 5,
  limiteGrupos: 1,
  limiteActividadesPorGrupo: 15,
  whiteLabel: false,
  reportesAvanzados: false,
  asistenteIa: false,
  cuotaTokensIaMensual: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Plan;

const PLAN_PRO: Plan = {
  ...PLAN_FREE,
  id: 'plan-pro',
  codigo: 'PRO',
  nombre: 'Pro',
  limiteTutores: null,
  limiteUsuarios: null,
  limiteGrupos: null,
  limiteActividadesPorGrupo: null,
  whiteLabel: true,
  reportesAvanzados: true,
  asistenteIa: true,
  cuotaTokensIaMensual: 2_000_000,
} as Plan;

function envelopeDePrueba(
  sobrescribir: Partial<EventEnvelope<OrganizacionCreadaPayload>> = {}
): EventEnvelope<OrganizacionCreadaPayload> {
  return {
    eventId: 'evento-1',
    eventType: 'OrganizacionCreada',
    producedBy: 'identity-service',
    organizacionId: 'org-1',
    occurredAt: new Date().toISOString(),
    correlationId: 'corr-1',
    payload: {
      organizacionId: 'org-1',
      nombre: 'Org Uno',
      emailContacto: 'org@ejemplo.com',
      creadaPorTutorId: 'tutor-1',
    },
    ...sobrescribir,
  };
}

interface OpcionesPrismaMock {
  eventoYaProcesado?: boolean;
  suscripcionExistente?: { id: string; organizacionId: string; planId: string } | null;
  suscripcionConPlan?: Record<string, unknown> | null;
}

function crearPrismaMock(opciones: OpcionesPrismaMock = {}) {
  const crearSuscripcion = vi.fn().mockResolvedValue({ id: 'sus-1' });
  const crearEventoProcesado = vi.fn().mockResolvedValue({ eventId: 'evento-1' });

  const tx = {
    suscripcion: {
      findFirst: vi.fn().mockResolvedValue(opciones.suscripcionExistente ?? null),
      create: crearSuscripcion,
    },
    eventoProcesado: { create: crearEventoProcesado },
  };

  const prisma = {
    client: {
      eventoProcesado: {
        findUnique: vi
          .fn()
          .mockResolvedValue(opciones.eventoYaProcesado ? { eventId: 'evento-1' } : null),
      },
      plan: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { codigo: string } }) =>
          Promise.resolve(where.codigo === 'FREE' ? PLAN_FREE : PLAN_PRO)
        ),
      },
      suscripcion: {
        findFirst: vi.fn().mockResolvedValue(opciones.suscripcionConPlan ?? null),
      },
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<void>) => fn(tx)),
    },
  } as unknown as PrismaService;

  return { prisma, tx, crearSuscripcion, crearEventoProcesado };
}

describe('SuscripcionesService — consumo de OrganizacionCreada (spec fase-04)', () => {
  it('crea la Suscripcion FREE AUTOMATICA y registra el evento como procesado', async () => {
    const { prisma, crearSuscripcion, crearEventoProcesado } = crearPrismaMock();
    const servicio = new SuscripcionesService(prisma);

    await servicio.procesarOrganizacionCreada(envelopeDePrueba());

    expect(crearSuscripcion).toHaveBeenCalledWith({
      data: { organizacionId: 'org-1', planId: 'plan-free', fuente: 'AUTOMATICA' },
    });
    expect(crearEventoProcesado).toHaveBeenCalledWith({
      data: { eventId: 'evento-1', consumidor: 'billing-service' },
    });
  });

  it('descarta un eventId ya procesado sin aplicar efectos (idempotencia ADR-00 §5)', async () => {
    const { prisma, crearSuscripcion, crearEventoProcesado } = crearPrismaMock({
      eventoYaProcesado: true,
    });
    const servicio = new SuscripcionesService(prisma);

    await servicio.procesarOrganizacionCreada(envelopeDePrueba());

    expect(crearSuscripcion).not.toHaveBeenCalled();
    expect(crearEventoProcesado).not.toHaveBeenCalled();
  });

  it('no duplica la suscripción si la organización ya tiene una (reentrega con otro eventId)', async () => {
    const { prisma, crearSuscripcion, crearEventoProcesado } = crearPrismaMock({
      suscripcionExistente: { id: 'sus-1', organizacionId: 'org-1', planId: 'plan-free' },
    });
    const servicio = new SuscripcionesService(prisma);

    await servicio.procesarOrganizacionCreada(envelopeDePrueba({ eventId: 'evento-2' }));

    expect(crearSuscripcion).not.toHaveBeenCalled();
    expect(crearEventoProcesado).toHaveBeenCalledWith({
      data: { eventId: 'evento-2', consumidor: 'billing-service' },
    });
  });

  it('una carrera P2002 (entrega concurrente) se descarta sin error', async () => {
    const { prisma } = crearPrismaMock();
    (prisma.client.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('unique constraint'), { code: 'P2002' })
    );
    const servicio = new SuscripcionesService(prisma);

    await expect(servicio.procesarOrganizacionCreada(envelopeDePrueba())).resolves.toBeUndefined();
  });
});

describe('SuscripcionesService — resolución de plan y entitlements (spec fase-04)', () => {
  it('sin suscripción resuelve FREE (default del sistema, no un error)', async () => {
    const { prisma } = crearPrismaMock();
    const servicio = new SuscripcionesService(prisma);

    await expect(servicio.planDeOrganizacion('org-sin-suscripcion')).resolves.toEqual({
      codigo: 'FREE',
    });
  });

  it('con suscripción ACTIVA devuelve el plan de la suscripción y sus entitlements', async () => {
    const { prisma } = crearPrismaMock({
      suscripcionConPlan: {
        id: 'sus-1',
        organizacionId: 'org-1',
        planId: 'plan-pro',
        estado: 'ACTIVA',
        fuente: 'MANUAL',
        plan: PLAN_PRO,
      },
    });
    const servicio = new SuscripcionesService(prisma);

    await expect(servicio.planDeOrganizacion('org-1')).resolves.toEqual({ codigo: 'PRO' });
    await expect(servicio.entitlementsDeOrganizacion('org-1')).resolves.toEqual({
      plan: 'PRO',
      limites: {
        tutores: null,
        usuarios: null,
        grupos: null,
        actividadesPorGrupo: null,
        tokensIaMensuales: 2_000_000,
      },
      features: { whiteLabel: true, reportesAvanzados: true, asistenteIa: true },
    });
  });

  it('los entitlements FREE reflejan los límites del seed', async () => {
    const { prisma } = crearPrismaMock();
    const servicio = new SuscripcionesService(prisma);

    await expect(servicio.entitlementsDeOrganizacion('org-nueva')).resolves.toEqual({
      plan: 'FREE',
      limites: {
        tutores: 2,
        usuarios: 5,
        grupos: 1,
        actividadesPorGrupo: 15,
        // fase-14-29: 0 y no null. null significa "sin límite", que es lo
        // contrario de lo que FREE tiene que decir.
        tokensIaMensuales: 0,
      },
      features: { whiteLabel: false, reportesAvanzados: false, asistenteIa: false },
    });
  });
});

describe('SuscripcionesService — GET /billing/mi-organizacion', () => {
  const tenant: TenantContext = {
    organizacionId: 'org-1',
    grupoIds: [],
    rol: 'ORG_ADMIN',
    principalId: 'tutor-1',
    principalType: 'TUTOR',
  } as TenantContext;

  it('devuelve SuscripcionDto + PlanDto de la organización del JWT', async () => {
    const { prisma } = crearPrismaMock({
      suscripcionConPlan: {
        id: 'sus-1',
        organizacionId: 'org-1',
        planId: 'plan-free',
        estado: 'ACTIVA',
        fuente: 'AUTOMATICA',
        plan: PLAN_FREE,
      },
    });
    const servicio = new SuscripcionesService(prisma);

    await expect(servicio.miOrganizacion(tenant)).resolves.toEqual({
      suscripcion: {
        id: 'sus-1',
        organizacionId: 'org-1',
        planId: 'plan-free',
        plan: 'FREE',
        estado: 'ACTIVA',
        fuente: 'AUTOMATICA',
      },
      plan: {
        id: 'plan-free',
        codigo: 'FREE',
        nombre: 'Free',
        limiteTutores: 2,
        limiteUsuarios: 5,
        limiteGrupos: 1,
        limiteActividadesPorGrupo: 15,
        whiteLabel: false,
        reportesAvanzados: false,
        asistenteIa: false,
        cuotaTokensIaMensual: 0,
      },
    });
  });

  it('404 SUSCRIPCION_NO_ENCONTRADA si la organización todavía no tiene fila', async () => {
    const { prisma } = crearPrismaMock();
    const servicio = new SuscripcionesService(prisma);

    await expect(servicio.miOrganizacion(tenant)).rejects.toThrow(
      SuscripcionNoEncontradaException
    );
  });
});
