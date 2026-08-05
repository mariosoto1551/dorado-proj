import type { IncomingMessage, ServerResponse } from 'node:http';

import { createProxyMiddleware } from 'http-proxy-middleware';

import { responderErrorGateway } from './respuesta-error';
import { TABLA_RUTEO, TIMEOUT_PROXY_DEFAULT_MS, type RutaProxy } from './tabla-ruteo';

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
) => void;

export interface LoggerProxy {
  warn(mensaje: string): void;
  error(mensaje: string): void;
}

/**
 * Un middleware por prefijo de la tabla de ruteo (spec fase-03):
 * - servicio con `<SERVICIO>_INTERNAL_URL` configurada → proxy puro
 *   (`http-proxy-middleware`), reescribiendo `/api/x/...` → `/x/...`;
 * - servicio sin URL → 503 `SERVICIO_NO_DISPONIBLE` (no 404 ni 500) hasta que
 *   la fase correspondiente lo levante.
 *
 * El Gateway no tiene lógica de negocio: cualquier regla nueva va en el
 * servicio destino, no acá.
 */
export function crearProxyMiddlewares(logger: LoggerProxy): Middleware[] {
  return TABLA_RUTEO.map((ruta) => {
    const urlInterna = process.env[ruta.servicio.envVar];

    if (!urlInterna) {
      return crearStub503(ruta, logger);
    }

    return createProxyMiddleware({
      // Función y no glob: los arrays de pathFilter no admiten mezclar paths
      // planos con globs, y el path plano solo hace indexOf(prefijo) === 0
      // (matchearía '/api/billing-x' para '/api/billing').
      pathFilter: (pathname) => coincidePrefijo(pathname, ruta.prefijo),
      target: urlInterna,
      changeOrigin: true,
      pathRewrite: { '^/api': '' },
      // Por ruta: solo /api/ai lo sube, porque solo él depende de un tercero
      // que piensa durante segundos (fase-14-29).
      proxyTimeout: ruta.timeoutMs ?? TIMEOUT_PROXY_DEFAULT_MS,
      on: {
        error: (err, req, res) => {
          logger.error(
            `Proxy hacia ${ruta.servicio.nombre} falló (${req.method} ${req.url}): ${err.message}`
          );

          // En upgrades websocket `res` puede ser un Socket — acá solo hay HTTP.
          if ('setHeader' in res && !res.headersSent) {
            responderErrorGateway(
              req,
              res,
              502,
              'SERVICIO_NO_RESPONDE',
              `El servicio ${ruta.servicio.nombre} no responde`
            );
          }
        },
      },
    }) as Middleware;
  });
}

function coincidePrefijo(pathname: string, prefijo: string): boolean {
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`);
}

function crearStub503(ruta: RutaProxy, logger: LoggerProxy): Middleware {
  return (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];

    if (!coincidePrefijo(path, ruta.prefijo)) {
      next();
      return;
    }

    logger.warn(
      `${req.method} ${path} → 503: ${ruta.servicio.envVar} no configurada (servicio de una fase futura)`
    );
    responderErrorGateway(
      req,
      res,
      503,
      'SERVICIO_NO_DISPONIBLE',
      `El servicio ${ruta.servicio.nombre} todavía no está disponible`
    );
  };
}
