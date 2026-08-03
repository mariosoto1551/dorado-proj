import type { IncomingMessage, ServerResponse } from 'node:http';

import { rateLimit } from 'express-rate-limit';

import { responderErrorGateway } from './respuesta-error';

type MiddlewareHttp = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
) => void;

/**
 * Rate limiting por IP (spec fase-03).
 *
 * DESVIACIÓN DOCUMENTADA (ver docs/progreso/fase-03): la spec nombraba
 * `ThrottlerGuard` de `@nestjs/throttler`, pero los guards de Nest solo corren
 * para rutas resueltas por el router de Nest — los requests proxiados se
 * resuelven en la cadena de middlewares Express y nunca llegan ahí. Se usa
 * `express-rate-limit` como middleware con LOS MISMOS límites de la spec:
 * 100 req/min por IP global, 10 req/min por IP en login y registro de
 * organización (mitigación de fuerza bruta).
 */
const VENTANA_MS = 60_000;

/**
 * Los límites de la spec. Son el **default** y no cambian: producción los usa
 * tal cual, sin definir ninguna variable.
 */
export const LIMITE_GLOBAL = 100;
export const LIMITE_AUTH_ESTRICTO = 10;

/**
 * Override por entorno, **solo para la suite E2E** (fase-14-23 T4·2ª).
 *
 * La suite tiene cinco escenarios de navegador que corren seguidos contra la
 * misma IP, y el presupuesto por IP es compartido: suites que están bien
 * empiezan a recibir 429 por lo que gastaron las anteriores, y el síntoma que
 * se ve es «el elemento no existe» —el 429 le pega al refresh silencioso y la
 * pestaña vuelve al login—, no «me limitaron».
 *
 * Se resuelve con un seam de configuración y no bajando la defensa: **sin la
 * variable, el límite es el de la spec**. `docker-compose` de desarrollo y la
 * corrida de E2E la definen; el deploy no.
 */
function limiteDe(variable: string, porDefecto: number): number {
  const crudo = process.env[variable];

  if (crudo === undefined) {
    return porDefecto;
  }

  const valor = Number.parseInt(crudo, 10);

  return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
}

const RUTAS_AUTH_ESTRICTAS: readonly RegExp[] = [
  /^\/api\/auth\/login\/?$/,
  /^\/api\/auth\/organizaciones\/?$/,
];

function manejador429(req: IncomingMessage, res: ServerResponse): void {
  responderErrorGateway(
    req,
    res,
    429,
    'DEMASIADAS_SOLICITUDES',
    'Demasiadas solicitudes desde esta IP — esperá un minuto y volvé a intentar'
  );
}

// express-rate-limit 8 declara sus firmas con los types de Express 5 y el
// workspace usa @types/express 4 (los que trae Nest 11) — el middleware solo
// necesita la superficie de node:http, así que se tipa contra eso.
function crearLimiter(limite: number): MiddlewareHttp {
  return rateLimit({
    windowMs: VENTANA_MS,
    limit: limite,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: manejador429 as never,
  }) as unknown as MiddlewareHttp;
}

export function crearRateLimitMiddleware(): MiddlewareHttp {
  const limiterGlobal = crearLimiter(limiteDe('RATE_LIMIT_GLOBAL', LIMITE_GLOBAL));
  const limiterEstricto = crearLimiter(
    limiteDe('RATE_LIMIT_AUTH', LIMITE_AUTH_ESTRICTO)
  );

  return (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];
    const esEstricta =
      req.method === 'POST' && RUTAS_AUTH_ESTRICTAS.some((patron) => patron.test(path));
    const limiter = esEstricta ? limiterEstricto : limiterGlobal;

    limiter(req, res, next);
  };
}
