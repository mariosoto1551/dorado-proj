import type { JwtPayload } from '@dorado/shared-types';

/**
 * Decodifica el payload de un JWT SIN verificar la firma — en el navegador la
 * firma no se puede (ni se debe) verificar: el token solo se usa para leer el
 * rol y decidir UI. La autoridad real es el Gateway, que valida RS256 en cada
 * request. Mismo criterio que app-web (fase-03).
 */
export function decodificarJwtPayload(token: string): JwtPayload | null {
  const partes = token.split('.');

  if (partes.length !== 3) {
    return null;
  }

  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);

    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}
