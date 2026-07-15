import { decodificarJwtPayload } from './jwt.util';

function tokenConPayload(payload: Record<string, unknown>): string {
  const base64url = (obj: Record<string, unknown>): string =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${base64url({ alg: 'RS256' })}.${base64url(payload)}.firma-falsa`;
}

describe('decodificarJwtPayload', () => {
  it('decodifica el payload de un JWT bien formado', () => {
    const token = tokenConPayload({
      sub: 'tutor-1',
      rol: 'ORG_ADMIN',
      grupoIds: ['g-1'],
    });

    const payload = decodificarJwtPayload(token);

    expect(payload).toMatchObject({ sub: 'tutor-1', rol: 'ORG_ADMIN', grupoIds: ['g-1'] });
  });

  it('devuelve null si el token no tiene tres partes', () => {
    expect(decodificarJwtPayload('no-es-un-jwt')).toBeNull();
  });

  it('devuelve null si el payload no es JSON válido', () => {
    expect(decodificarJwtPayload('cabecera.%%%.firma')).toBeNull();
  });
});
