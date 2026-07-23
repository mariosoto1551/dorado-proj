import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { GrupoDto } from '@dorado/shared-types';

import { IconoComponent } from '../../componentes/icono.component';
import { IdentityApiService } from '../../core/api/identity-api.service';

/** Selector de Grupo para tutores/ORG_ADMIN que administran más de uno (fase-10). */
@Component({
  selector: 'app-selector-grupo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent],
  template: `
    <section class="mx-auto max-w-2xl px-4 py-8">
      <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Elegí un grupo</h1>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Administrás {{ grupos().length }} grupos.</p>

      <div class="mt-6 grid gap-3 sm:grid-cols-2">
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
    </section>
  `,
})
export class SelectorGrupoPage {
  private readonly identity = inject(IdentityApiService);

  protected readonly grupos = signal<GrupoDto[]>([]);

  constructor() {
    this.identity.listarGrupos().subscribe((g) => this.grupos.set(g));
  }
}
