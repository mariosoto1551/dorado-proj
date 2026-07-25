import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import type { GrupoDto } from '@dorado/shared-types';

import { IconoComponent } from '../../componentes/icono.component';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Chip selector de grupo para el PARTICIPANTE multi-grupo (fase-14). Vive en la
 * topbar. Si el participante está en un solo grupo (el caso común) no renderiza
 * nada. Al elegir otro grupo, `AuthService.grupoUsuario` cambia y las pantallas
 * del participante (que reaccionan a esa señal) se recargan con el grupo nuevo.
 */
@Component({
  selector: 'app-selector-grupo-usuario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    @if (multiGrupo()) {
      <button
        type="button"
        (click)="abierto.set(true)"
        class="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-marca-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-marca-600"
      >
        <span class="h-4 w-4 text-marca-500"><app-icono nombre="users" /></span>
        <span class="max-w-32 truncate">{{ nombreActivo() }}</span>
        <span class="h-4 w-4 text-slate-400"><app-icono nombre="chevron" /></span>
      </button>

      @if (abierto()) {
        <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Cerrar"
            (click)="abierto.set(false)"
            class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"
          ></button>
          <div
            class="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up dark:bg-slate-900 sm:rounded-2xl"
          >
            <h2 class="text-lg font-bold text-slate-900 dark:text-white">Elegí tu grupo</h2>
            <ul class="mt-3 space-y-1.5">
              @for (g of grupos(); track g.id) {
                <li>
                  <button
                    type="button"
                    (click)="elegir(g.id)"
                    class="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition"
                    [class]="
                      g.id === grupoActivo()
                        ? 'border-marca-500 bg-marca-50 dark:border-marca-500 dark:bg-marca-900/30'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60'
                    "
                  >
                    <span
                      class="flex h-9 w-9 items-center justify-center rounded-lg bg-marca-50 text-marca-600 dark:bg-marca-900/40 dark:text-marca-300"
                    >
                      <span class="h-5 w-5"><app-icono nombre="users" /></span>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-semibold text-slate-900 dark:text-white">{{ g.nombre }}</span>
                      @if (g.id === grupoActivo()) {
                        <span class="block text-xs text-marca-600 dark:text-marca-400">Activo</span>
                      }
                    </span>
                  </button>
                </li>
              }
            </ul>
          </div>
        </div>
      }
    }
  `,
})
export class SelectorGrupoUsuarioComponent {
  private readonly auth = inject(AuthService);

  private readonly identity = inject(IdentityApiService);

  protected readonly grupos = signal<GrupoDto[]>([]);

  protected readonly abierto = signal(false);

  protected readonly grupoActivo = this.auth.grupoUsuario;

  protected readonly multiGrupo = computed(() => this.auth.gruposUsuario().length > 1);

  protected readonly nombreActivo = computed(() => {
    const activo = this.grupoActivo();
    return this.grupos().find((g) => g.id === activo)?.nombre ?? 'Grupo';
  });

  constructor() {
    // Trae los nombres solo cuando hace falta (participante en 2+ grupos).
    effect(() => {
      if (this.multiGrupo() && this.grupos().length === 0) {
        this.identity.misGrupos().subscribe((g) => this.grupos.set(g));
      }
    });
  }

  protected elegir(grupoId: string): void {
    this.auth.seleccionarGrupoUsuario(grupoId);
    this.abierto.set(false);
  }
}
