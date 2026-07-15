import type { IncomingMessage, ServerResponse } from 'node:http';

import type { RequestConJwt } from './jwt-validation.middleware';

/**
 * Headers de contexto de tenant que el Gateway agrega al request saliente
 * (ADR-00 §4). Los servicios confían en ellos SOLO si vienen acompañados del
 * `x-internal-secret` correcto.
 */
const HEADERS_TENANT = [
  'x-organizacion-id',
  'x-grupo-ids',
  'x-rol',
  'x-principal-id',
  'x-principal-type',
  'x-internal-secret',
] as const;

/**
 * Inyecta el contexto de tenant decodificado del JWT ya validado.
 *
 * Anti-spoofing: SIEMPRE borra primero cualquier header de tenant que venga
 * del cliente (incluido `x-internal-secret`) — nadie de afuera puede
 * inyectarlos, con o sin sesión. Después, si hay JWT válido, los setea desde
 * el payload verificado.
 */
export function crearTenantHeaderInjector(
  obtenerSecreto: () => string
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return (req, _res, next) => {
    for (const header of HEADERS_TENANT) {
      delete req.headers[header];
    }

    const payload = (req as RequestConJwt).jwtPayload;

    if (payload) {
      req.headers['x-organizacion-id'] = payload.organizacionId;
      req.headers['x-grupo-ids'] = payload.grupoIds.join(',');
      req.headers['x-rol'] = payload.rol;
      req.headers['x-principal-id'] = payload.sub;
      req.headers['x-principal-type'] = payload.principalType;
      req.headers['x-internal-secret'] = obtenerSecreto();
    }

    next();
  };
}
