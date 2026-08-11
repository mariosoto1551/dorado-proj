import { Rol } from '@dorado/shared-types';

import { decodificarJwtPayload } from './jwt.util';

/** Arma un JWT de mentira con el payload pedido (firma inventada: no se verifica). */
function tokenCon(payload: Record<string, unknown>): string {
  const base64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${base64url({ alg: 'RS256' })}.${base64url(payload)}.firma-que-nadie-mira`;
}

describe('decodificarJwtPayload', () => {
  it('lee el payload de un token bien formado', () => {
    const payload = decodificarJwtPayload(tokenCon({ sub: 'admin-1', rol: Rol.PLATFORM_ADMIN }));

    expect(payload?.sub).toBe('admin-1');
    expect(payload?.rol).toBe(Rol.PLATFORM_ADMIN);
  });

  /**
   * Devolver `null` y no explotar es lo que importa acá: quien llama decide
   * "no hay sesión", que es la respuesta segura. Si esto tirara, un token
   * corrupto en la cookie dejaría la app en pantalla blanca en vez de en el
   * login.
   */
  it('con cualquier cosa que no sea un JWT devuelve null, sin tirar', () => {
    expect(decodificarJwtPayload('')).toBeNull();
    expect(decodificarJwtPayload('no-es-un-token')).toBeNull();
    expect(decodificarJwtPayload('a.b')).toBeNull();
    expect(decodificarJwtPayload('a.b.c.d')).toBeNull();
    expect(decodificarJwtPayload('cabecera.{no-es-base64}.firma')).toBeNull();
  });

  it('un payload que es base64 válido pero no JSON también da null', () => {
    expect(decodificarJwtPayload(`x.${btoa('esto no es json')}.y`)).toBeNull();
  });
});
