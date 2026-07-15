import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  type HttpEvent,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError, type Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/**
 * Rutas de auth que NUNCA llevan Authorization ni disparan reintento por 401:
 * un 401 de login es "credenciales malas", y un 401 del propio refresh no se
 * puede rescatar con otro refresh (evita el loop infinito).
 */
const RUTAS_SIN_TOKEN: readonly RegExp[] = [
  /\/auth\/login$/,
  /\/auth\/refresh$/,
  /\/auth\/organizaciones$/,
  /\/auth\/invitaciones\/[^/]+(\/canjear)?$/,
];

function esRutaSinToken(url: string): boolean {
  return RUTAS_SIN_TOKEN.some((patron) => patron.test(url));
}

function conToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  // withCredentials en TODA request a la API: la cookie httpOnly del refresh
  // viaja entre orígenes distintos (4200 → 3000) solo con esto (fase-03).
  if (!token) {
    return req.clone({ withCredentials: true });
  }

  return req.clone({
    withCredentials: true,
    setHeaders: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Interceptor funcional de sesión (spec fase-03): agrega el Bearer a toda
 * request hacia la API salvo las públicas; ante un 401 intenta UN refresh
 * silencioso y reintenta la request original; si el refresh también falla,
 * limpia la sesión y redirige a /login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const router = inject(Router);

  if (esRutaSinToken(req.url)) {
    return next(conToken(req, null));
  }

  return next(conToken(req, auth.accessToken())).pipe(
    catchError((error: unknown): Observable<HttpEvent<unknown>> => {
      const es401 = error instanceof HttpErrorResponse && error.status === 401;

      if (!es401) {
        return throwError(() => error);
      }

      return auth.refrescar().pipe(
        switchMap((refrescado) => {
          if (!refrescado) {
            void router.navigate(['/login']);

            return throwError(() => error);
          }

          return next(conToken(req, auth.accessToken()));
        })
      );
    })
  );
};
