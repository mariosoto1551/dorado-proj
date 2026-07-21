import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { IdentityApiService } from '../api/identity-api.service';
import { AuthService } from './auth.service';

/**
 * Guard de la ruta '' (fase-10, "enrutamiento por rol tras login"):
 *  - USUARIO: se queda en '/' (home de actividades) → true.
 *  - TUTOR/ORG_ADMIN: redirige a su Grupo. Con 0 grupos → /onboarding; con 1 →
 *    /grupos/:id; con más de 1 → /grupos (selector). Un ORG_ADMIN ve todos los
 *    grupos de la org (grupoIds del JWT viene vacío por diseño), por eso se
 *    consulta la lista real en vez de fiarse del token.
 */
export const inicioUsuarioGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const identity = inject(IdentityApiService);
  const router = inject(Router);

  if (!auth.esTutor()) {
    return true;
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
