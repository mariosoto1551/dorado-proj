import type { IncomingMessage, ServerResponse } from 'node:http';

import { jwtVerify } from 'jose';

import { JWT_ALG, obtenerClavePublicaJwt } from '@dorado/shared-auth';
import type { JwtPayload } from '@dorado/shared-types';

import { responderErrorGateway } from './respuesta-error';

/**
 * Rutas públicas del Gateway (spec fase-03: lista explícita, no heurística).
 * Todo lo demás bajo /api requiere JWT válido o devuelve 401 antes de llegar
 * al proxy.
 */
const RUTAS_PUBLICAS: ReadonlyArray<{ metodo: string; patron: RegExp }> = [
  { metodo: 'POST', patron: /^\/api\/auth\/organizaciones\/?$/ },
  { metodo: 'POST', patron: /^\/api\/auth\/login\/?$/ },
  { metodo: 'POST', patron: /^\/api\/auth\/refresh\/?$/ },
  // Auth del panel de plataforma (fase-14-05): sin bearer (refresh vía cookie).
  { metodo: 'POST', patron: /^\/api\/auth\/admin\/login\/?$/ },
  { metodo: 'POST', patron: /^\/api\/auth\/admin\/refresh\/?$/ },
  { metodo: 'GET', patron: /^\/api\/auth\/invitaciones\/[^/]+\/?$/ },
  { metodo: 'POST', patron: /^\/api\/auth\/invitaciones\/[^/]+\/canjear\/?$/ },
  { metodo: 'GET', patron: /^\/api\/health\/?$/ },
];

export function esRutaPublica(metodo: string, path: string): boolean {
  return RUTAS_PUBLICAS.some((ruta) => ruta.metodo === metodo && ruta.patron.test(path));
}

/** Request con el payload ya verificado, para los middlewares siguientes. */
export interface RequestConJwt extends IncomingMessage {
  jwtPayload?: JwtPayload;
}

function extraerPath(req: IncomingMessage): string {
  return (req.url ?? '').split('?')[0];
}

function extraerBearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;

  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return undefined;
  }

  return header.slice('Bearer '.length);
}

/**
 * Valida firma RS256 (clave pública `JWT_PUBLIC_KEY`, ADR-00 §3) y expiración
 * de todo request bajo /api que no esté en la lista de rutas públicas.
 * No consulta a identity-service: la validación es local con `jose`.
 *
 * Solo aplica a paths bajo /api — cualquier otro path sigue al router de Nest
 * (que responde 404 vía el HttpExceptionFilter).
 */
export function crearJwtValidationMiddleware(): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) => Promise<void> {
  return async (req, res, next) => {
    const path = extraerPath(req);

    if (!path.startsWith('/api/') || esRutaPublica(req.method ?? '', path)) {
      next();
      return;
    }

    const token = extraerBearer(req);

    if (!token) {
      responderErrorGateway(req, res, 401, 'NO_AUTENTICADO', 'Falta el token de acceso');
      return;
    }

    try {
      const clave = await obtenerClavePublicaJwt();
      const { payload } = await jwtVerify(token, clave, { algorithms: [JWT_ALG] });

      (req as RequestConJwt).jwtPayload = payload as unknown as JwtPayload;
      next();
    } catch {
      responderErrorGateway(
        req,
        res,
        401,
        'NO_AUTENTICADO',
        'Token de acceso inválido o expirado'
      );
    }
  };
}
