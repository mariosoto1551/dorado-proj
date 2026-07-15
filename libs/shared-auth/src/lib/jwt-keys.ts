import { importSPKI } from 'jose';

export const JWT_ALG = 'RS256';

/**
 * Las claves RS256 viajan en variables de entorno (`JWT_PUBLIC_KEY` en todos
 * los servicios; `JWT_PRIVATE_KEY` solo en identity-service — ADR-00 §3).
 * Para que un PEM multilínea quepa en una línea de `.env`, se admite el PEM
 * codificado en base64 además del PEM crudo.
 */
export function decodificarPem(valor: string): string {
  const limpio = valor.trim();

  if (limpio.startsWith('-----BEGIN')) {
    return limpio;
  }

  return Buffer.from(limpio, 'base64').toString('utf8');
}

let clavePublicaCacheada: Promise<CryptoKey> | undefined;
let pemCacheado: string | undefined;

/**
 * Importa (y cachea) la clave pública RS256 desde `JWT_PUBLIC_KEY`.
 * La validación de que la variable exista al arranque es responsabilidad del
 * schema de env de cada servicio (ADR-00 §8); acá solo se falla defensivamente.
 */
export function obtenerClavePublicaJwt(): Promise<CryptoKey> {
  const valor = process.env['JWT_PUBLIC_KEY'];

  if (!valor) {
    throw new Error(
      'JWT_PUBLIC_KEY no está definida — el servicio no puede validar tokens (ver ADR-00 §3 y §8)'
    );
  }

  const pem = decodificarPem(valor);

  if (!clavePublicaCacheada || pemCacheado !== pem) {
    pemCacheado = pem;
    clavePublicaCacheada = importSPKI(pem, JWT_ALG);
  }

  return clavePublicaCacheada;
}
