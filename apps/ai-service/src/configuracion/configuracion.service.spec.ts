import { describe, expect, it, vi } from 'vitest';

import { EntitlementsDto, PrincipalType, Rol, TenantContext } from '@dorado/shared-types';

import type { BillingClientService } from '../clientes/billing-client.service';
import { AvisoNoAceptadoException, FeatureNoDisponibleException } from '../comun/excepciones';
import type { PrismaService } from '../prisma/prisma.service';
import { ConfiguracionService } from './configuracion.service';

const TENANT: TenantContext = {
  organizacionId: 'org-1',
  grupoIds: [],
  rol: Rol.ORG_ADMIN,
  principalId: 'tutor-1',
  principalType: PrincipalType.TUTOR,
};

function entitlements(asistenteIa: boolean, tokens: number | null): EntitlementsDto {
  return {
    plan: asistenteIa ? 'PRO' : 'FREE',
    limites: {
      tutores: null,
      usuarios: null,
      grupos: null,
      actividadesPorGrupo: null,
      tokensIaMensuales: tokens,
    },
    features: { whiteLabel: asistenteIa, reportesAvanzados: asistenteIa, asistenteIa },
  } as EntitlementsDto;
}

interface OpcionesMock {
  fila?: { habilitada: boolean; aceptoAvisoEn: Date | null } | null;
  tokens?: number;
}

function crearMocks(opciones: OpcionesMock = {}) {
  const upsert = vi.fn(
    async (args: {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => ({
      habilitada: false,
      aceptoAvisoEn: null,
      ...opciones.fila,
      ...args.update,
    })
  );
  const prisma = {
    client: {
      configuracionIaOrganizacion: {
        findUnique: vi.fn(async () => opciones.fila ?? null),
        upsert,
      },
      mensaje: {
        aggregate: vi.fn(async () => ({
          _sum: { tokensEntrada: opciones.tokens ?? 0, tokensSalida: 0 },
        })),
      },
    },
  } as unknown as PrismaService;

  return { prisma, upsert };
}

function crearBilling(resultado: EntitlementsDto | null): BillingClientService {
  return {
    resolveEntitlements: vi.fn(async () => resultado),
  } as unknown as BillingClientService;
}

describe('ConfiguracionService — GET /ai/configuracion', () => {
  it('una organización FREE ve la feature no disponible y no puede usarla', async () => {
    const { prisma } = crearMocks();
    const servicio = new ConfiguracionService(prisma, crearBilling(entitlements(false, 0)));

    await expect(servicio.obtener(TENANT)).resolves.toMatchObject({
      disponibleEnPlan: false,
      habilitada: false,
      avisoAceptado: false,
      cuotaTokensMensuales: 0,
      puedeUsarse: false,
    });
  });

  it('PRO con el switch prendido y cuota libre puede usarse', async () => {
    const { prisma } = crearMocks({
      fila: { habilitada: true, aceptoAvisoEn: new Date('2026-08-04T12:00:00Z') },
      tokens: 1000,
    });
    const servicio = new ConfiguracionService(prisma, crearBilling(entitlements(true, 2_000_000)));

    await expect(servicio.obtener(TENANT)).resolves.toMatchObject({
      disponibleEnPlan: true,
      habilitada: true,
      avisoAceptado: true,
      aceptoAvisoEn: '2026-08-04T12:00:00.000Z',
      tokensConsumidosMes: 1000,
      puedeUsarse: true,
    });
  });

  it('PRO habilitada pero con la cuota agotada NO puede usarse', async () => {
    const { prisma } = crearMocks({
      fila: { habilitada: true, aceptoAvisoEn: new Date() },
      tokens: 2_000_000,
    });
    const servicio = new ConfiguracionService(prisma, crearBilling(entitlements(true, 2_000_000)));

    await expect(servicio.obtener(TENANT)).resolves.toMatchObject({
      disponibleEnPlan: true,
      habilitada: true,
      puedeUsarse: false,
    });
  });

  it('cuota null significa SIN LÍMITE, no cuota 0', async () => {
    const { prisma } = crearMocks({
      fila: { habilitada: true, aceptoAvisoEn: new Date() },
      tokens: 99_000_000,
    });
    const servicio = new ConfiguracionService(prisma, crearBilling(entitlements(true, null)));

    await expect(servicio.obtener(TENANT)).resolves.toMatchObject({
      cuotaTokensMensuales: null,
      puedeUsarse: true,
    });
  });

  it('billing caído apaga el asistente (fail-closed, al revés que fase-04)', async () => {
    const { prisma } = crearMocks({ fila: { habilitada: true, aceptoAvisoEn: new Date() } });
    const servicio = new ConfiguracionService(prisma, crearBilling(null));

    await expect(servicio.obtener(TENANT)).resolves.toMatchObject({
      disponibleEnPlan: false,
      // El switch sigue prendido en la base: lo que cae es la disponibilidad.
      habilitada: true,
      puedeUsarse: false,
    });
  });

  it('el consumo del mes suma entrada + salida del ledger, sin contador mutable', async () => {
    const prisma = {
      client: {
        mensaje: {
          aggregate: vi.fn(async () => ({ _sum: { tokensEntrada: 700, tokensSalida: 300 } })),
        },
      },
    } as unknown as PrismaService;
    const servicio = new ConfiguracionService(prisma, crearBilling(null));

    await expect(servicio.tokensConsumidosMes('org-1')).resolves.toBe(1000);
  });

  it('el consumo se acota al mes calendario en curso y a la organización', async () => {
    const aggregate = vi.fn(async () => ({ _sum: { tokensEntrada: 0, tokensSalida: 0 } }));
    const prisma = { client: { mensaje: { aggregate } } } as unknown as PrismaService;
    const servicio = new ConfiguracionService(prisma, crearBilling(null));

    await servicio.tokensConsumidosMes('org-1', new Date('2026-08-20T10:00:00Z'));

    expect(aggregate).toHaveBeenCalledWith({
      where: { organizacionId: 'org-1', createdAt: { gte: new Date('2026-08-01T00:00:00Z') } },
      _sum: { tokensEntrada: true, tokensSalida: true },
    });
  });
});

describe('ConfiguracionService — PUT /ai/configuracion', () => {
  it('402 FEATURE_NO_DISPONIBLE si el plan no la incluye', async () => {
    const { prisma, upsert } = crearMocks();
    const servicio = new ConfiguracionService(prisma, crearBilling(entitlements(false, 0)));

    await expect(
      servicio.cambiar(TENANT, { habilitada: true, aceptaAviso: true })
    ).rejects.toThrow(FeatureNoDisponibleException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('400 AVISO_NO_ACEPTADO si intenta habilitar sin aceptar', async () => {
    const { prisma, upsert } = crearMocks();
    const servicio = new ConfiguracionService(prisma, crearBilling(entitlements(true, 2_000_000)));

    await expect(servicio.cambiar(TENANT, { habilitada: true })).rejects.toThrow(
      AvisoNoAceptadoException
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('habilitar con el aviso aceptado registra fecha y quién lo aceptó', async () => {
    const { prisma, upsert } = crearMocks();
    const servicio = new ConfiguracionService(prisma, crearBilling(entitlements(true, 2_000_000)));

    await servicio.cambiar(TENANT, { habilitada: true, aceptaAviso: true });

    const { update } = upsert.mock.calls[0][0];
    expect(update['habilitada']).toBe(true);
    expect(update['aceptoAvisoPorUsuarioId']).toBe('tutor-1');
    expect(update['aceptoAvisoEn']).toBeInstanceOf(Date);
  });

  it('deshabilitar NO borra el consentimiento: un hecho no se retira', async () => {
    const aceptoAvisoEn = new Date('2026-08-01T09:00:00Z');
    const { prisma, upsert } = crearMocks({ fila: { habilitada: true, aceptoAvisoEn } });
    const servicio = new ConfiguracionService(prisma, crearBilling(entitlements(true, 2_000_000)));

    await servicio.cambiar(TENANT, { habilitada: false });

    const { update } = upsert.mock.calls[0][0];
    expect(update).toEqual({ habilitada: false });
    expect(update).not.toHaveProperty('aceptoAvisoEn');
  });

  it('volver a prender después de apagar no vuelve a pedir el aviso', async () => {
    const aceptoAvisoEn = new Date('2026-08-01T09:00:00Z');
    const { prisma, upsert } = crearMocks({ fila: { habilitada: false, aceptoAvisoEn } });
    const servicio = new ConfiguracionService(prisma, crearBilling(entitlements(true, 2_000_000)));

    await servicio.cambiar(TENANT, { habilitada: true });

    const { update } = upsert.mock.calls[0][0];
    expect(update).toEqual({ habilitada: true });
  });
});
