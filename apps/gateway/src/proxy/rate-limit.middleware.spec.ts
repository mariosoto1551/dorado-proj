import { describe, expect, it, vi } from 'vitest';

import {
  crearRateLimitMiddleware,
  LIMITE_AUTH_ESTRICTO,
} from './rate-limit.middleware';
import { crearReqFake, crearResFake, type ResFake } from './testing/fakes';

async function ejecutar(
  middleware: ReturnType<typeof crearRateLimitMiddleware>,
  url: string,
  ip: string
): Promise<{ res: ResFake; next: ReturnType<typeof vi.fn> }> {
  const req = crearReqFake({ method: 'POST', url, ip });
  const res = crearResFake();
  const next = vi.fn();

  middleware(req, res, next);
  // express-rate-limit resuelve el store de forma asíncrona.
  await new Promise((resolver) => setImmediate(resolver));

  return { res, next };
}

describe('crearRateLimitMiddleware', () => {
  it(`el intento ${LIMITE_AUTH_ESTRICTO + 1} de login en la misma ventana devuelve 429`, async () => {
    const middleware = crearRateLimitMiddleware();

    for (let intento = 1; intento <= LIMITE_AUTH_ESTRICTO; intento++) {
      const { next, res } = await ejecutar(middleware, '/api/auth/login', '10.0.0.1');

      expect(next, `intento ${intento} debía pasar`).toHaveBeenCalledOnce();
      expect(res.cuerpo).toBe('');
    }

    const { next, res } = await ejecutar(middleware, '/api/auth/login', '10.0.0.1');

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.cuerpoJson()).toMatchObject({
      statusCode: 429,
      code: 'DEMASIADAS_SOLICITUDES',
    });
  });

  it('el límite estricto de login no afecta al resto de las rutas (límite global)', async () => {
    const middleware = crearRateLimitMiddleware();

    for (let intento = 1; intento <= LIMITE_AUTH_ESTRICTO; intento++) {
      await ejecutar(middleware, '/api/auth/login', '10.0.0.2');
    }

    // La ruta general usa el limiter global (100/min), que sigue disponible.
    const { next } = await ejecutar(middleware, '/api/identity/grupos', '10.0.0.2');

    expect(next).toHaveBeenCalledOnce();
  });

  it('el registro de organización también usa el límite estricto', async () => {
    const middleware = crearRateLimitMiddleware();

    for (let intento = 1; intento <= LIMITE_AUTH_ESTRICTO; intento++) {
      await ejecutar(middleware, '/api/auth/organizaciones', '10.0.0.3');
    }

    const { res } = await ejecutar(middleware, '/api/auth/organizaciones', '10.0.0.3');

    expect(res.statusCode).toBe(429);
  });
});
