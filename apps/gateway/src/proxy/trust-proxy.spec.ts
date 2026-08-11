import { describe, expect, it } from 'vitest';

import { resolverTrustProxy, TrustProxyInvalidoError } from './trust-proxy';

describe('resolverTrustProxy', () => {
  it('sin definir no confía en nadie: es el default del servidor de casa', () => {
    expect(resolverTrustProxy(undefined)).toBe(false);
    expect(resolverTrustProxy('')).toBe(false);
    expect(resolverTrustProxy('   ')).toBe(false);
  });

  it('apagado explícito, en las dos formas que alguien escribiría', () => {
    expect(resolverTrustProxy('false')).toBe(false);
    expect(resolverTrustProxy('FALSE')).toBe(false);
    expect(resolverTrustProxy('0')).toBe(false);
  });

  it('un entero es la cantidad de saltos (1 = Caddy o Render)', () => {
    expect(resolverTrustProxy('1')).toBe(1);
    expect(resolverTrustProxy('2')).toBe(2);
    expect(resolverTrustProxy(' 1 ')).toBe(1);
  });

  it('los presets y las listas de CIDR pasan tal cual a Express', () => {
    expect(resolverTrustProxy('loopback')).toBe('loopback');
    expect(resolverTrustProxy('uniquelocal')).toBe('uniquelocal');
    expect(resolverTrustProxy('10.0.0.0/8,172.18.0.0/16')).toBe('10.0.0.0/8,172.18.0.0/16');
  });

  /**
   * El caso que motiva todo el módulo. `true` es lo que cualquiera pondría
   * para "sí, hay un proxy", y es justamente el valor que rompe la defensa:
   * Express toma el primer `X-Forwarded-For` de la cadena, que lo escribe el
   * cliente. El error tiene que llegar en el arranque, no en la factura.
   */
  it('rechaza `true` y explica por qué en el mensaje', () => {
    expect(() => resolverTrustProxy('true')).toThrow(TrustProxyInvalidoError);
    expect(() => resolverTrustProxy('TRUE')).toThrow(/no se acepta/);
    expect(() => resolverTrustProxy('true')).toThrow(/cantidad de proxies/);
  });
});
