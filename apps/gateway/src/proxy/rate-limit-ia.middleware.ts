import type { IncomingMessage, ServerResponse } from 'node:http';

import { rateLimit } from 'express-rate-limit';

import type { RequestConJwt } from './jwt-validation.middleware';
import { responderErrorGateway } from './respuesta-error';

type MiddlewareHttp = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
) => void;

const VENTANA_MS = 60_000;

/**
 * Turnos del asistente por usuario y por minuto (fase-14-29, Parte E punto 5c).
 *
 * **Por qué existe además del límite global**: el global es 100 req/min *por
 * IP*, un techo pensado para requests que cuestan milisegundos de CPU. Un
 * turno del asistente cuesta decenas de segundos y **dinero real contra un
 * proveedor externo**, así que 100 no es un límite: es una factura. Y como es
 * por IP, dos Tutores de la misma oficina comparten presupuesto mientras que
 * un solo usuario mal intencionado con una IP propia se lleva las 100.
 *
 * **Por qué 10**: un turno tarda entre 20 y 50 segundos y hay un humano
 * esperándolo, así que nadie llega ni a 3 por minuto usando la app. 10 deja
 * margen de sobra para reintentos y para tener dos pestañas abiertas, y corta
 * bastante antes de que un bucle automático haga daño. La cuota mensual de
 * tokens sigue siendo la defensa del gasto total; esto acota la ráfaga.
 */
export const LIMITE_IA_POR_USUARIO = 10;

/**
 * Las dos rutas que corren el loop y gastan tokens. Las demás de `/api/ai`
 * —listar, leer, descartar, configuración— son lecturas baratas y se quedan
 * bajo el límite global.
 */
const RUTAS_QUE_GASTAN: readonly RegExp[] = [
  /^\/api\/ai\/conversaciones\/?$/,
  /^\/api\/ai\/conversaciones\/[^/]+\/mensajes\/?$/,
];

function limiteDe(variable: string, porDefecto: number): number {
  const crudo = process.env[variable];

  if (crudo === undefined) {
    return porDefecto;
  }

  const valor = Number.parseInt(crudo, 10);

  return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
}

export function esRutaQueGasta(metodo: string | undefined, path: string): boolean {
  return metodo === 'POST' && RUTAS_QUE_GASTAN.some((patron) => patron.test(path));
}

/**
 * Límite por usuario sobre los endpoints del asistente que llaman al proveedor.
 *
 * **Va DESPUÉS del middleware de validación JWT y no puede ir antes**: la
 * clave es el `sub` del token, y antes del paso 4 de `main.ts` ese dato no
 * existe todavía. Por eso no es un número más en el limitador que ya estaba
 * —ese corre primero, por IP— sino una capa propia.
 */
export function crearRateLimitIaMiddleware(): MiddlewareHttp {
  const limiter = rateLimit({
    windowMs: VENTANA_MS,
    limit: limiteDe('RATE_LIMIT_IA', LIMITE_IA_POR_USUARIO),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // La clave es la persona, no la IP: dos Tutores detrás del mismo router no
    // se comen el presupuesto entre ellos, y cambiar de red no resetea nada.
    keyGenerator: ((req: IncomingMessage) => (req as RequestConJwt).jwtPayload?.sub ?? '') as never,
    // Las validaciones de la librería son todas sobre el manejo de IPs
    // (trust proxy, IPv6, X-Forwarded-For) y acá la IP no participa de la
    // clave. Dejarlas prendidas solo produce warnings sobre un riesgo que este
    // limitador no corre.
    validate: false,
    handler: ((req: IncomingMessage, res: ServerResponse) => {
      responderErrorGateway(
        req,
        res,
        429,
        'DEMASIADAS_SOLICITUDES',
        'Estás mandándole mensajes al asistente demasiado rápido — esperá un momento'
      );
    }) as never,
  }) as unknown as MiddlewareHttp;

  return (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];

    if (!esRutaQueGasta(req.method, path)) {
      next();

      return;
    }

    // Sin token no hay a quién contarle los turnos. No puede pasar (el paso 4
    // ya rechazó), y si pasara, dejarlo seguir es lo correcto: el que decide
    // sobre la autenticación es aquel middleware, no este.
    if (!(req as RequestConJwt).jwtPayload?.sub) {
      next();

      return;
    }

    limiter(req, res, next);
  };
}
