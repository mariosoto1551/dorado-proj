import { Component, inject } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';

/**
 * Contenido inicial del shell — placeholder hasta el frontend completo
 * (Fase 10: dashboards por rol, zonas, actividades).
 */
@Component({
  selector: 'app-inicio-page',
  template: `
    <section class="px-4 py-8">
      <h2 class="text-2xl font-bold tracking-tight">
        ¡Hola, {{ auth.nombreMostrable() }}!
      </h2>
      <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Tu espacio está listo. Las actividades, puntos y zonas llegan en las
        próximas fases.
      </p>
    </section>
  `,
})
export class InicioPageComponent {
  protected readonly auth = inject(AuthService);
}
