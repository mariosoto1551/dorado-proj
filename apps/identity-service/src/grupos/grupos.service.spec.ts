import { describe, expect, it, vi } from 'vitest';

import type { EntitlementsDto, TenantContext } from '@dorado/shared-types';

import type { BillingClientService } from '../billing/billing-client.service';
import type { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { LimitePlanAlcanzadoException } from '../comun/excepciones';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { PrismaService } from '../prisma/prisma.service';
import { GruposService } from './grupos.service';

const TENANT_ADMIN: TenantContext = {
  organizacionId: 'org-1',
  grupoIds: [],
  rol: 'ORG_ADMIN',
  principalId: 'tutor-1',
  principalType: 'TUTOR',
} as TenantContext;

function entitlements(limiteGrupos: number | null): EntitlementsDto {
  return {
    plan: limiteGrupos === null ? 'PRO' : 'FREE',
    limites: { tutores: 2, usuarios: 5, grupos: limiteGrupos, actividadesPorGrupo: 15 },
    features: { whiteLabel: false, reportesAvanzados: false },
  } as EntitlementsDto;
}

function crearMocks(opciones: {
  gruposActuales: number;
  entitlements: EntitlementsDto | null;
}) {
  const crearGrupo = vi.fn().mockResolvedValue({
    id: 'grupo-nuevo',
    organizacionId: 'org-1',
    nombre: 'Grupo Nuevo',
    timezone: 'America/La_Paz',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const prisma = {
    client: {
      grupo: { count: vi.fn().mockResolvedValue(opciones.gruposActuales) },
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn({ grupo: { create: crearGrupo }, tutorGrupo: { create: vi.fn() } })
        ),
    },
  } as unknown as PrismaService;

  const accesoGrupo = { asegurarAcceso: vi.fn() } as unknown as AccesoGrupoService;
  const billing = {
    resolveEntitlements: vi.fn().mockResolvedValue(opciones.entitlements),
  } as unknown as BillingClientService;
  const eventos = {
    publicar: vi.fn(),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  return { servicio: new GruposService(prisma, accesoGrupo, billing, eventos), crearGrupo };
}

describe('GruposService — límite de grupos por plan (spec fase-04)', () => {
  it('403 LIMITE_PLAN_ALCANZADO (recurso grupos) al alcanzar el límite FREE', async () => {
    const { servicio, crearGrupo } = crearMocks({
      gruposActuales: 1,
      entitlements: entitlements(1),
    });

    let capturada: unknown;

    try {
      await servicio.crear(TENANT_ADMIN, { nombre: 'Otro', timezone: 'America/La_Paz' });
    } catch (error) {
      capturada = error;
    }

    expect(capturada).toBeInstanceOf(LimitePlanAlcanzadoException);
    expect((capturada as LimitePlanAlcanzadoException).getStatus()).toBe(403);
    expect((capturada as LimitePlanAlcanzadoException).extras).toEqual({ recurso: 'grupos' });
    expect(crearGrupo).not.toHaveBeenCalled();
  });

  it('crea el grupo cuando todavía hay cupo (0 de 1)', async () => {
    const { servicio, crearGrupo } = crearMocks({
      gruposActuales: 0,
      entitlements: entitlements(1),
    });

    await servicio.crear(TENANT_ADMIN, { nombre: 'Primero', timezone: 'America/La_Paz' });

    expect(crearGrupo).toHaveBeenCalled();
  });

  it('límite null (PRO) = sin límite: crea sin contar', async () => {
    const { servicio, crearGrupo } = crearMocks({
      gruposActuales: 999,
      entitlements: entitlements(null),
    });

    await servicio.crear(TENANT_ADMIN, { nombre: 'Sin límite', timezone: 'America/La_Paz' });

    expect(crearGrupo).toHaveBeenCalled();
  });

  it('si billing no está disponible el chequeo se omite (no bloquea la creación)', async () => {
    const { servicio, crearGrupo } = crearMocks({
      gruposActuales: 999,
      entitlements: null,
    });

    await servicio.crear(TENANT_ADMIN, { nombre: 'Fallback', timezone: 'America/La_Paz' });

    expect(crearGrupo).toHaveBeenCalled();
  });
});
