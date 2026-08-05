import type { IncomingMessage, ServerResponse } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RequestConJwt } from './jwt-validation.middleware';
import {
  crearRateLimitIaMiddleware,
  esRutaQueGasta,
  LIMITE_IA_POR_USUARIO,
} from './rate-limit-ia.middleware';

function pedido(metodo: string, url: string, sub: string | undefined): IncomingMessage {
  const req = {
    method: metodo,
    url,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as RequestConJwt;

  if (sub) {
    req.jwtPayload = { sub } as RequestConJwt['jwtPayload'];
  }

  return req as IncomingMessage;
}

/**
 * Doble de respuesta. `append` es de **Express**, no de `node:http`, y sin él
 * `standardHeaders: 'draft-8'` lanza — la librería captura ese fallo y lo pasa
 * a `next(err)`, o sea que **el request sigue de largo como si no hubiera
 * límite**. Un doble incompleto acá convierte «cortado» en «permitido» sin
 * decir nada, así que la lista de métodos es parte del test.
 */
function respuesta() {
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    getHeader: vi.fn(),
    removeHeader: vi.fn(),
    append: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    headersSent: false,
  };

  return res as unknown as ServerResponse & { end: ReturnType<typeof vi.fn> };
}

/** Corre el middleware N veces con el mismo usuario y cuenta cuántas pasaron. */
async function correr(
  middleware: ReturnType<typeof crearRateLimitIaMiddleware>,
  veces: number,
  sub: string,
  url = '/api/ai/conversaciones/abc/mensajes'
): Promise<{ pasaron: number; ultimaRespuesta: ReturnType<typeof respuesta> }> {
  let pasaron = 0;
  let ultimaRespuesta = respuesta();

  for (let i = 0; i < veces; i += 1) {
    ultimaRespuesta = respuesta();

    await new Promise<void>((resolver) => {
      const res = ultimaRespuesta;

      vi.mocked(res.end).mockImplementation((() => {
        resolver();

        return res;
      }) as never);

      middleware(pedido('POST', url, sub), res, () => {
        pasaron += 1;
        resolver();
      });
    });
  }

  return { pasaron, ultimaRespuesta };
}

describe('esRutaQueGasta', () => {
  it('reconoce las dos rutas que llaman al proveedor', () => {
    expect(esRutaQueGasta('POST', '/api/ai/conversaciones')).toBe(true);
    expect(esRutaQueGasta('POST', '/api/ai/conversaciones/abc-123/mensajes')).toBe(true);
  });

  it('deja afuera las lecturas y las acciones que no gastan tokens', () => {
    // Listar, leer, archivar, descartar y la configuración son baratas: se
    // quedan bajo el límite global. Meterlas acá haría que revisar el
    // historial consuma el presupuesto de conversar.
    expect(esRutaQueGasta('GET', '/api/ai/conversaciones')).toBe(false);
    expect(esRutaQueGasta('POST', '/api/ai/conversaciones/abc/archivar')).toBe(false);
    expect(esRutaQueGasta('POST', '/api/ai/propuestas/abc/aplicada')).toBe(false);
    expect(esRutaQueGasta('POST', '/api/activity/grupos/g1/actividades')).toBe(false);
  });

  it('no matchea un prefijo parecido', () => {
    expect(esRutaQueGasta('POST', '/api/ai/conversaciones-falsas')).toBe(false);
  });
});

describe('crearRateLimitIaMiddleware', () => {
  afterEach(() => {
    delete process.env['RATE_LIMIT_IA'];
  });

  it('corta al usuario que pasa el límite', async () => {
    const middleware = crearRateLimitIaMiddleware();

    const { pasaron, ultimaRespuesta } = await correr(
      middleware,
      LIMITE_IA_POR_USUARIO + 1,
      'usuario-a'
    );

    expect(pasaron).toBe(LIMITE_IA_POR_USUARIO);
    expect(ultimaRespuesta.statusCode).toBe(429);
    expect(String(vi.mocked(ultimaRespuesta.end).mock.calls[0][0])).toContain(
      'DEMASIADAS_SOLICITUDES'
    );
  });

  it('la clave es la persona, no la IP', async () => {
    const middleware = crearRateLimitIaMiddleware();

    await correr(middleware, LIMITE_IA_POR_USUARIO, 'usuario-a');
    const { pasaron } = await correr(middleware, 1, 'usuario-b');

    // Dos Tutores de la misma casa comparten IP: si el presupuesto fuera por
    // IP, el segundo pagaría por lo que gastó el primero.
    expect(pasaron).toBe(1);
  });

  it('no toca las rutas que no gastan tokens', async () => {
    const middleware = crearRateLimitIaMiddleware();

    const { pasaron } = await correr(
      middleware,
      LIMITE_IA_POR_USUARIO + 5,
      'usuario-c',
      '/api/ai/conversaciones/abc/archivar'
    );

    expect(pasaron).toBe(LIMITE_IA_POR_USUARIO + 5);
  });

  it('el límite se puede bajar por entorno para la suite E2E', async () => {
    process.env['RATE_LIMIT_IA'] = '2';
    const middleware = crearRateLimitIaMiddleware();

    const { pasaron } = await correr(middleware, 3, 'usuario-d');

    expect(pasaron).toBe(2);
  });

  it('sin la variable, el límite es el del código', async () => {
    process.env['RATE_LIMIT_IA'] = 'no-es-un-numero';
    const middleware = crearRateLimitIaMiddleware();

    const { pasaron } = await correr(middleware, LIMITE_IA_POR_USUARIO + 1, 'usuario-e');

    // Un valor basura no puede convertirse en «sin límite»: la defensa de un
    // endpoint que gasta dinero no se apaga por un typo en un .env.
    expect(pasaron).toBe(LIMITE_IA_POR_USUARIO);
  });
});
