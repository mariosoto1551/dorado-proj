import type { IncomingMessage, ServerResponse } from 'node:http';

import helmet from 'helmet';

type MiddlewareHttp = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
) => void;

/**
 * Cabeceras de seguridad de las respuestas del Gateway.
 *
 * Los defaults de `helmet` están pensados para un servidor que devuelve HTML;
 * esto devuelve JSON y nada más, así que dos de ellos hay que cambiarlos o
 * rompen el producto en vez de protegerlo:
 *
 * - **CSP**: la política por defecto habla de scripts, estilos e imágenes, que
 *   acá no existen. Se reemplaza por la única que tiene sentido en una API:
 *   `default-src 'none'` (esta respuesta no carga nada) y `frame-ancestors
 *   'none'` (nadie la embebe). Sirve de verdad cuando un error o un payload
 *   vuelve a interpretarse como documento.
 * - **CORP**: `helmet` la pone en `same-origin`, y el caso normal de este
 *   servicio es justamente el contrario — `app-web` vive en otro origen
 *   (`app.dominio` contra `api.dominio`, o `:4200` contra `:3000` en casa).
 *   Va `cross-origin`; quién puede leer qué lo decide CORS, que ya está.
 *
 * `X-Powered-By` se va (no regalar la versión de Express), y queda el resto del
 * paquete estándar: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`.
 */
export function crearCabecerasSeguridadMiddleware(hsts: boolean): MiddlewareHttp {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // El default de helmet es `SAMEORIGIN`, que para una API no quiere decir
    // nada: no hay ningún frame propio que valga la pena permitir.
    frameguard: { action: 'deny' },
    // Sin TLS delante, HSTS es una cabecera que el navegador ignora por
    // definición (solo la honra sobre https). Se decide con `hsts` en vez de
    // mandarla siempre para que el modo casa —http en la LAN— no lleve una
    // instrucción que promete algo que ahí no existe.
    hsts: hsts ? { maxAge: 15_552_000, includeSubDomains: true } : false,
  }) as unknown as MiddlewareHttp;
}

/**
 * ¿Mandar HSTS? Por defecto, sí cuando hay un proxy delante (`TRUST_PROXY`),
 * porque ese proxy es el que termina TLS en las tres variantes de despliegue a
 * internet (Caddy en el VPS, el balanceador en Render). `HSTS=true|false` lo
 * fuerza para los casos que no siguen esa forma.
 */
export function debeMandarHsts(
  hstsCrudo: string | undefined,
  hayProxyDelante: boolean
): boolean {
  const valor = (hstsCrudo ?? '').trim().toLowerCase();

  if (valor === 'true') {
    return true;
  }

  if (valor === 'false') {
    return false;
  }

  return hayProxyDelante;
}
