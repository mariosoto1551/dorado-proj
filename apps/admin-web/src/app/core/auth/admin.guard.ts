import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { SesionAdminService } from './sesion-admin.service';

/**
 * Protege el panel. El refresh silencioso ya corrió en el inicializador de la
 * app (app.config.ts), así que a esta altura el signal refleja la sesión real.
 * Un login tenant no sirve acá: aunque tuviera token, el backend responde 403
 * en /api/admin/*; igual exigimos rol PLATFORM_ADMIN antes de dejar entrar.
 */
export const adminGuard: CanActivateFn = () => {
  const sesion = inject(SesionAdminService);
  const router = inject(Router);

  return sesion.sesionActiva() && sesion.esPlatformAdmin()
    ? true
    : router.createUrlTree(['/login']);
};
