import type { IncomingMessage, ServerResponse } from 'node:http';

import { describe, expect, it } from 'vitest';

import {
  crearCabecerasSeguridadMiddleware,
  debeMandarHsts,
} from './cabeceras-seguridad.middleware';

/**
 * Corre el middleware sobre un par request/response mínimo y devuelve las
 * cabeceras que quedaron puestas. `helmet` solo usa `setHeader`/`removeHeader`
 * y el método del request, así que no hace falta un servidor de verdad.
 */
function cabecerasDe(hsts: boolean): Record<string, string> {
  const puestas: Record<string, string> = {};
  const req = { method: 'GET', headers: {}, url: '/api/auth/login' } as IncomingMessage;
  const res = {
    setHeader(nombre: string, valor: string | number | readonly string[]) {
      puestas[nombre.toLowerCase()] = String(valor);
    },
    removeHeader(nombre: string) {
      delete puestas[nombre.toLowerCase()];
    },
    getHeader(nombre: string) {
      return puestas[nombre.toLowerCase()];
    },
  } as unknown as ServerResponse;

  let siguio = false;

  crearCabecerasSeguridadMiddleware(hsts)(req, res, () => {
    siguio = true;
  });

  expect(siguio, 'el middleware tiene que llamar a next()').toBe(true);

  return puestas;
}

describe('crearCabecerasSeguridadMiddleware', () => {
  it('pone las cabeceras que importan en una API', () => {
    const cabeceras = cabecerasDe(true);

    expect(cabeceras['x-content-type-options']).toBe('nosniff');
    expect(cabeceras['x-frame-options']).toBe('DENY');
    expect(cabeceras['referrer-policy']).toBeDefined();
  });

  it('la CSP es la de una API, no la de una página: no carga nada y nadie la embebe', () => {
    const csp = cabecerasDe(true)['content-security-policy'];

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // Los defaults HTML de helmet no tienen que haberse colado.
    expect(csp).not.toContain('script-src');
    expect(csp).not.toContain('img-src');
  });

  /**
   * El default de helmet acá es `same-origin`, y `app-web` SIEMPRE vive en
   * otro origen que el Gateway. Si esto se vuelve `same-origin` el día que
   * alguien "simplifique" la config, se rompe el producto entero.
   */
  it('CORP es cross-origin: el consumidor legítimo está en otro origen', () => {
    expect(cabecerasDe(true)['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('no regala la versión de Express', () => {
    expect(cabecerasDe(true)['x-powered-by']).toBeUndefined();
  });

  it('HSTS solo cuando se pide: sin TLS delante es una promesa que nadie cumple', () => {
    expect(cabecerasDe(true)['strict-transport-security']).toContain('max-age=15552000');
    expect(cabecerasDe(false)['strict-transport-security']).toBeUndefined();
  });
});

describe('debeMandarHsts', () => {
  it('por defecto sigue a si hay un proxy delante (el que termina TLS)', () => {
    expect(debeMandarHsts(undefined, true)).toBe(true);
    expect(debeMandarHsts(undefined, false)).toBe(false);
    expect(debeMandarHsts('', false)).toBe(false);
  });

  it('la variable explícita gana en las dos direcciones', () => {
    expect(debeMandarHsts('true', false)).toBe(true);
    expect(debeMandarHsts('false', true)).toBe(false);
    expect(debeMandarHsts('TRUE', false)).toBe(true);
  });
});
