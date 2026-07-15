import type { Request, Response } from 'express';

import type { RefreshEmitido } from './tokens.service';

/** Nombre de la cookie del refresh token (ADR-00 §3). */
export const REFRESH_COOKIE = 'dorado_refresh';

// path '/' en el MVP: el path que ve el navegador incluye el prefijo del
// Gateway (/api/auth/...) y este servicio no conoce ese prefijo. Se puede
// acotar en Fase 3 cuando exista el Gateway.
const OPCIONES_BASE = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
} as const;

export function establecerCookieRefresh(
  res: Response,
  refresh: RefreshEmitido,
  secure: boolean
): void {
  res.cookie(REFRESH_COOKIE, refresh.token, {
    ...OPCIONES_BASE,
    secure,
    expires: refresh.expiraEn,
  });
}

export function limpiarCookieRefresh(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, OPCIONES_BASE);
}

export function leerCookieRefresh(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE];
}
