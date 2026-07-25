import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { GrupoDto } from '@dorado/shared-types';

import { IconoComponent } from '../../componentes/icono.component';
import { AuthService } from '../../core/auth/auth.service';
import { IdentityApiService } from '../../core/api/identity-api.service';

/**
 * Home del ORG_ADMIN (fase-14, "inicio distinto por rol"): panel de toda la
 * organización — a diferencia del TUTOR, que entra directo a su grupo. Muestra
 * todos los grupos de la organización (el ORG_ADMIN los ve todos por diseño,
 * ver GruposService.listar) y el acceso a crear uno nuevo. La facturación
 * queda fuera por ahora (decisión de José).
 */
@Component({
  selector: 'app-panel-organizacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent],
  template: `
    <section class="mx-auto max-w-4xl px-4 py-8">
      <div class="flex flex-wrap items-center gap-3">
        <span
          class="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
        >
          <span class="h-6 w-6"><app-icono nombre="shield" /></span>
        </span>
        <div class="min-w-0">
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Tu organización</h1>
          <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Hola, {{ auth.nombreMostrable() }} · Administrador
          </p>
        </div>
      </div>

      <div class="mt-6 flex items-center justify-between">
        <h2 class="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Grupos ({{ grupos().length }})
        </h2>
        <a
          routerLink="/onboarding"
          class="flex items-center gap-1.5 rounded-lg bg-marca-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-marca-700"
        >
          <span class="h-4 w-4"><app-icono nombre="plus" /></span>
          Nuevo grupo
        </a>
      </div>

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (grupos().length === 0) {
        <div
          class="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"
        >
          <p class="text-sm text-slate-500 dark:text-slate-400">
            Todavía no hay grupos en tu organización. Creá el primero para empezar.
          </p>
        </div>
      } @else {
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          @for (g of grupos(); track g.id) {
            <a
              [routerLink]="['/grupos', g.id]"
              class="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-marca-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-marca-700"
            >
              <span
                class="flex h-11 w-11 items-center justify-center rounded-xl bg-marca-50 text-marca-600 dark:bg-marca-900/40 dark:text-marca-300"
              >
                <span class="h-5 w-5"><app-icono nombre="users" /></span>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold text-slate-900 dark:text-white">{{ g.nombre }}</span>
                <span class="block text-xs text-slate-400 dark:text-slate-500">{{ g.timezone }}</span>
              </span>
              <span class="h-5 w-5 text-slate-300 transition group-hover:text-marca-500 dark:text-slate-600">
                <app-icono nombre="chevron" />
              </span>
            </a>
          }
        </div>
      }
    </section>
  `,
})
export class PanelOrganizacionPage {
  protected readonly auth = inject(AuthService);

  private readonly identity = inject(IdentityApiService);

  protected readonly grupos = signal<GrupoDto[]>([]);

  protected readonly cargando = signal(true);

  constructor() {
    this.identity.listarGrupos().subscribe({
      next: (g) => {
        this.grupos.set(g);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
