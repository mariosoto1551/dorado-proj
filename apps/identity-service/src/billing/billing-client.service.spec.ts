import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConfigService } from '@nestjs/config';

import { BillingClientService } from './billing-client.service';

const ENV = {
  BILLING_INTERNAL_URL: 'http://localhost:3002',
  GATEWAY_INTERNAL_SECRET: 'secreto-de-prueba-16chars',
} as Record<string, string>;

function crearServicio(): BillingClientService {
  const config = {
    getOrThrow: (clave: string) => ENV[clave],
  } as unknown as ConfigService;

  return new BillingClientService(config);
}

function stubFetchOk(body: unknown): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', mock);

  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BillingClientService — resolución de plan (spec fase-04)', () => {
  it('devuelve el código que responde billing, llamando con x-internal-secret', async () => {
    const fetchMock = stubFetchOk({ codigo: 'PRO' });
    const servicio = crearServicio();

    await expect(servicio.resolvePlan('org-1')).resolves.toBe('PRO');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3002/internal/billing/organizaciones/org-1/plan');
    expect((init.headers as Record<string, string>)['x-internal-secret']).toBe(
      'secreto-de-prueba-16chars'
    );
  });

  it('fallback FREE si billing responde un error HTTP (el login no se rompe)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) })
    );

    await expect(crearServicio().resolvePlan('org-1')).resolves.toBe('FREE');
  });

  it('fallback FREE si billing está caído (error de red o timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(crearServicio().resolvePlan('org-1')).resolves.toBe('FREE');
  });
});

describe('BillingClientService — entitlements', () => {
  it('devuelve los entitlements cuando billing responde', async () => {
    const entitlements = {
      plan: 'FREE',
      limites: { tutores: 2, usuarios: 5, grupos: 1, actividadesPorGrupo: 15 },
      features: { whiteLabel: false, reportesAvanzados: false },
    };
    stubFetchOk(entitlements);

    await expect(crearServicio().resolveEntitlements('org-1')).resolves.toEqual(entitlements);
  });

  it('devuelve null si billing no está disponible (el llamador omite el chequeo)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    await expect(crearServicio().resolveEntitlements('org-1')).resolves.toBeNull();
  });
});
