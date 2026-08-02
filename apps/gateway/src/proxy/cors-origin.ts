/**
 * Decisión de origen permitido para CORS.
 *
 * Regla base: lista explícita de orígenes (`APP_WEB_URL`, `PUBLIC_SITE_URL`),
 * nunca `'*'` — con `credentials: true` (cookie `dorado_refresh`) el wildcard
 * no funciona.
 *
 * Con `CORS_ALLOW_LAN=true` ("modo casa", ver `scripts/home-up.mjs`) se
 * REFLEJAN además los orígenes de la red de casa, para que la familia entre
 * desde sus celus/laptops sin listar cada dirección a mano:
 *
 *   - IPs privadas RFC 1918 (`10.x`, `192.168.x`, `172.16-31.x`) y loopback.
 *   - Nombres de host locales: una etiqueta sola (`http://dorado:4200`) o un
 *     nombre bajo un sufijo de red doméstica (`http://dorado.local:4200`, el
 *     que resuelve mDNS/Bonjour sin configurar nada).
 *
 * Aceptar el nombre además de la IP es lo que hace que un atajo estable
 * funcione: la IP que reparte el router cambia, el nombre no. El frontend ya
 * acompaña — deriva `apiBaseUrl` del host desde el que se abre la app (ver
 * `apps/app-web/src/environments/environment.ts`), así que entrando por
 * `http://dorado.local:4200` le pega solo a `http://dorado.local:3000/api`.
 *
 * Se refleja el origen puntual, nunca `'*'`, para no romper las credentials.
 */

/** Sufijos de red doméstica que ningún registrador público puede vender. */
const SUFIJOS_LOCALES = ['local', 'lan', 'casa', 'internal', 'home', 'home.arpa'];

/** Etiqueta DNS: alfanumérica, con guiones intermedios. */
const ETIQUETA = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';

const IPV4_PRIVADA =
  /^(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

const HOST_LOCAL = new RegExp(
  `^(?:${ETIQUETA}|(?:${ETIQUETA}\\.)+(?:${SUFIJOS_LOCALES.join('|').replace(/\./g, '\\.')}))$`,
  'i'
);

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * ¿El host pertenece a la red de casa? Solo se consulta si `CORS_ALLOW_LAN`
 * está activo — en producción esta rama nunca corre.
 */
function esHostDeRedLocal(hostname: string): boolean {
  const host = hostname.toLowerCase();

  return LOOPBACK.has(host) || IPV4_PRIVADA.test(host) || HOST_LOCAL.test(host);
}

/**
 * Construye el callback de `origin` que espera `app.enableCors()`.
 *
 * @param origenesPermitidos Lista explícita (la de producción).
 * @param permitirRedLocal   `true` en modo casa: refleja también la LAN.
 */
export function crearVerificadorDeOrigen(
  origenesPermitidos: string[],
  permitirRedLocal: boolean
): (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void {
  return (origin, cb) => {
    // Sin Origin (curl, same-origin, healthchecks internos) → permitido.
    if (!origin) {
      cb(null, true);

      return;
    }

    if (origenesPermitidos.includes(origin)) {
      cb(null, true);

      return;
    }

    cb(null, permitirRedLocal && esOrigenDeRedLocal(origin));
  };
}

/** `true` si el origen es una URL http(s) apuntando a la red de casa. */
export function esOrigenDeRedLocal(origin: string): boolean {
  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }

  return esHostDeRedLocal(url.hostname);
}
