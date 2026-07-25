import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { IdentityApiService } from '../api/identity-api.service';
import { AuthService } from './auth.service';

/**
 * Guard de la ruta '' (fase-10 + fase-14, "enrutamiento por rol tras login"):
 *  - USUARIO: se queda en '/' (home de actividades) → true.
 *  - ORG_ADMIN: va a su panel de organización (/organizacion), su inicio propio
 *    distinto del tutor (fase-14). Con 0 grupos todavía → /onboarding.
 *  - TUTOR: redirige a su Grupo. Con 0 grupos → /onboarding; con 1 →
 *    /grupos/:id; con más de 1 → /grupos (selector). Se consulta la lista real
 *    de grupos (el grupoIds del JWT viene vacío para el ORG_ADMIN por diseño).
 */
export const inicioUsuarioGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const identity = inject(IdentityApiService);
  const router = inject(Router);

  if (!auth.esTutor()) {
    return true;
  }

  if (auth.esOrgAdmin()) {
    return identity.listarGrupos().pipe(
      map((grupos) =>
        router.createUrlTree([grupos.length === 0 ? '/onboarding' : '/organizacion'])
      ),
      catchError(() => of(router.createUrlTree(['/organizacion'])))
    );
  }

  return identity.listarGrupos().pipe(
    map((grupos) => {
      if (grupos.length === 0) {
        return router.createUrlTree(['/onboarding']);
      }

      if (grupos.length === 1) {
        return router.createUrlTree(['/grupos', grupos[0].id]);
      }

      return router.createUrlTree(['/grupos']);
    }),
    catchError(() => of(router.createUrlTree(['/onboarding'])))
  );
};
