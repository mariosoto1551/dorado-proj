import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { crearProxyMiddlewares, type LoggerProxy } from './proxy.middleware';
import { TABLA_RUTEO } from './tabla-ruteo';
import { crearReqFake, crearResFake } from './testing/fakes';

const loggerFake: LoggerProxy = { warn: vi.fn(), error: vi.fn() };

describe('crearProxyMiddlewares', () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    for (const ruta of TABLA_RUTEO) {
      delete process.env[ruta.servicio.envVar];
    }
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it('crea un middleware por cada entrada de la tabla de ruteo', () => {
    expect(crearProxyMiddlewares(loggerFake)).toHaveLength(TABLA_RUTEO.length);
  });

  it('un prefijo sin <SERVICIO>_INTERNAL_URL responde 503, no 404 ni 500', () => {
    const middlewares = crearProxyMiddlewares(loggerFake);
    const indiceBilling = TABLA_RUTEO.findIndex((r) => r.prefijo === '/api/billing');
    const req = crearReqFake({ method: 'GET', url: '/api/billing/planes' });
    const res = crearResFake();
    const next = vi.fn();

    middlewares[indiceBilling](req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.cuerpoJson()).toMatchObject({
      statusCode: 503,
      code: 'SERVICIO_NO_DISPONIBLE',
    });
  });

  it('el stub 503 de un prefijo deja pasar los requests de otros prefijos', () => {
    const middlewares = crearProxyMiddlewares(loggerFake);
    const indiceBilling = TABLA_RUTEO.findIndex((r) => r.prefijo === '/api/billing');
    const req = crearReqFake({ method: 'GET', url: '/api/health' });
    const res = crearResFake();
    const next = vi.fn();

    middlewares[indiceBilling](req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.cuerpo).toBe('');
  });

  it('no confunde prefijos que comparten inicio (/api/billing vs /api/billing-x)', () => {
    const middlewares = crearProxyMiddlewares(loggerFake);
    const indiceBilling = TABLA_RUTEO.findIndex((r) => r.prefijo === '/api/billing');
    const req = crearReqFake({ method: 'GET', url: '/api/billing-x/algo' });
    const res = crearResFake();
    const next = vi.fn();

    middlewares[indiceBilling](req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
