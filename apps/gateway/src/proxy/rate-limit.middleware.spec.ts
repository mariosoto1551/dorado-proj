import { afterEach, describe, expect, it, vi } from 'vitest';

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

/**
 * El seam de la fase-14-23 T4·2ª. Lo que estos casos fijan no es el override
 * sino **el default**: sin variable, el límite tiene que seguir siendo el de la
 * spec, porque es lo que corre en producción.
 */
describe('crearRateLimitMiddleware — override por entorno', () => {
  afterEach(() => {
    delete process.env['RATE_LIMIT_AUTH'];
    delete process.env['RATE_LIMIT_GLOBAL'];
  });

  it('sin variables usa los límites de la spec', async () => {
    const middleware = crearRateLimitMiddleware();

    for (let intento = 1; intento <= LIMITE_AUTH_ESTRICTO; intento++) {
      await ejecutar(middleware, '/api/auth/login', '10.1.0.1');
    }

    const { res } = await ejecutar(middleware, '/api/auth/login', '10.1.0.1');

    expect(res.statusCode).toBe(429);
  });

  it('con la variable definida, la ventana admite ese número', async () => {
    process.env['RATE_LIMIT_AUTH'] = String(LIMITE_AUTH_ESTRICTO + 5);
    const middleware = crearRateLimitMiddleware();

    for (let intento = 1; intento <= LIMITE_AUTH_ESTRICTO + 5; intento++) {
      const { next } = await ejecutar(middleware, '/api/auth/login', '10.1.0.2');

      expect(next, `intento ${intento} debía pasar`).toHaveBeenCalledOnce();
    }

    const { res } = await ejecutar(middleware, '/api/auth/login', '10.1.0.2');

    expect(res.statusCode).toBe(429);
  });

  it('un valor basura NO afloja el límite: cae al de la spec', async () => {
    // Importa que sea así y no al revés: un typo en el deploy no puede
    // convertirse en «sin límite».
    process.env['RATE_LIMIT_AUTH'] = 'muchas';
    const middleware = crearRateLimitMiddleware();

    for (let intento = 1; intento <= LIMITE_AUTH_ESTRICTO; intento++) {
      await ejecutar(middleware, '/api/auth/login', '10.1.0.3');
    }

    const { res } = await ejecutar(middleware, '/api/auth/login', '10.1.0.3');

    expect(res.statusCode).toBe(429);
  });
});
