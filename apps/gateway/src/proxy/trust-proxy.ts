/**
 * Cuántos proxies hay delante del Gateway (`TRUST_PROXY`).
 *
 * **Por qué existe.** El rate limiting del paso 3 de `main.ts` cuenta por IP, y
 * la IP que ve Express es la del socket. Con un reverse proxy delante —Caddy en
 * el VPS, el balanceador de Render— ese socket viene SIEMPRE de la misma
 * dirección, así que todos los usuarios del mundo caen en el mismo balde: el
 * límite de 10/min sobre `POST /api/auth/login`, que existe para frenar fuerza
 * bruta contra UNA cuenta, se convierte en 10 logins por minuto para toda la
 * plataforma. No es que la defensa quede floja: queda invertida, porque el
 * primero que se equivoca de contraseña les corta el login a los demás.
 *
 * Express resuelve esto con `trust proxy`, pero no lo activamos siempre: en el
 * servidor de casa el Gateway está expuesto directo (`docker-compose.casa.yml`
 * publica el 3000) y ahí confiar en `X-Forwarded-For` sería regalar el spoofeo
 * —cualquiera manda ese header—. Por eso el valor es explícito por entorno y el
 * default es no confiar en nadie.
 *
 * **Valores aceptados**:
 *   - sin definir, `false`, `0` → no se confía en ningún proxy (default, casa).
 *   - un entero positivo → esa cantidad de saltos (`1` con Caddy o Render).
 *   - texto → se pasa tal cual a Express: presets (`loopback`, `uniquelocal`)
 *     o lista de IPs/CIDRs separados por coma (`10.0.0.0/8,172.18.0.0/16`).
 *
 * **`true` se rechaza a propósito**: en Express significa "confiá en toda la
 * cadena", con lo cual el cliente elige su propia IP escribiendo el header y
 * volvemos al problema de arriba disfrazado de solución. Si de verdad hay una
 * cadena larga, se pone el número de saltos.
 */
export type ValorTrustProxy = false | number | string;

export class TrustProxyInvalidoError extends Error {}

export function resolverTrustProxy(crudo: string | undefined): ValorTrustProxy {
  const valor = (crudo ?? '').trim();

  if (valor === '' || valor.toLowerCase() === 'false' || valor === '0') {
    return false;
  }

  if (valor.toLowerCase() === 'true') {
    throw new TrustProxyInvalidoError(
      'TRUST_PROXY=true no se acepta: confiaría en toda la cadena de X-Forwarded-For ' +
        'y cualquier cliente podría elegir su propia IP para el rate limiting. ' +
        'Usá la cantidad de proxies que hay delante (1 con Caddy o Render), ' +
        'una lista de IPs/CIDRs, o dejalo sin definir si el Gateway está expuesto directo.'
    );
  }

  if (/^\d+$/.test(valor)) {
    return Number.parseInt(valor, 10);
  }

  return valor;
}
