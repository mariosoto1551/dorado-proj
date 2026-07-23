import {
  HttpErrorResponse,
  type HttpEvent,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError, type Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { SesionAdminService } from './sesion-admin.service';

/**
 * Rutas de auth que NUNCA llevan Authorization ni disparan reintento por 401:
 * un 401 de login es "credenciales malas", y un 401 del propio refresh no se
 * rescata con otro refresh (evita el loop infinito).
 */
const RUTAS_SIN_TOKEN: readonly RegExp[] = [/\/auth\/admin\/login$/, /\/auth\/admin\/refresh$/];

function esRutaSinToken(url: string): boolean {
  return RUTAS_SIN_TOKEN.some((patron) => patron.test(url));
}

function conToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  // withCredentials siempre: la cookie httpOnly del refresh viaja entre orígenes
  // distintos (4300 → 3000) solo con esto.
  if (!token) {
    return req.clone({ withCredentials: true });
  }

  return req.clone({
    withCredentials: true,
    setHeaders: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Interceptor de sesión del panel (fase-14-05): agrega el Bearer a toda request
 * a la API salvo las públicas; ante un 401 intenta UN refresh silencioso y
 * reintenta; si el refresh también falla, redirige a /login.
 */
export const adminInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  const sesion = inject(SesionAdminService);
  const router = inject(Router);

  if (esRutaSinToken(req.url)) {
    return next(conToken(req, null));
  }

  return next(conToken(req, sesion.accessToken())).pipe(
    catchError((error: unknown): Observable<HttpEvent<unknown>> => {
      const es401 = error instanceof HttpErrorResponse && error.status === 401;

      if (!es401) {
        return throwError(() => error);
      }

      return sesion.refrescar().pipe(
        switchMap((refrescado) => {
          if (!refrescado) {
            void router.navigate(['/login']);

            return throwError(() => error);
          }

          return next(conToken(req, sesion.accessToken()));
        })
      );
    })
  );
};
