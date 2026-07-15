import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Protege el shell autenticado. El refresh silencioso ya corrió en el
 * inicializador de la app (app.config.ts), así que a esta altura el signal
 * refleja el estado real de la sesión.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.sesionActiva() ? true : router.createUrlTree(['/login']);
};
