import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Rutas solo de tutor (ORG_ADMIN/TUTOR), ej. /onboarding: un USUARIO que
 * llegue acá vuelve al shell (spec fase-03).
 */
export const soloTutorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.esTutor() ? true : router.createUrlTree(['/']);
};
