import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from './auth.service';

/**
 * Rutas exclusivas del ORG_ADMIN (fase-14, diferenciación admin/tutor), ej.
 * /organizacion: un TUTOR (o USUARIO) que llegue acá se va a su inicio ('/'),
 * donde el enrutamiento por rol lo manda al lugar que le corresponde.
 */
export const soloOrgAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.esOrgAdmin() ? true : router.createUrlTree(['/']);
};
