import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import type { TutorDto } from '@dorado/shared-types';
import { ConfirmDialogComponent } from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { mensajeDeError } from '../../core/api/errores';

/** Lista de tutores del grupo (fase-10). Solo visible/editable por ORG_ADMIN. */
@Component({
  selector: 'app-tutores',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EncabezadoPaginaComponent, IconoComponent, ConfirmDialogComponent],
  template: `
    <section class="mx-auto max-w-3xl px-4 py-6">
      <app-encabezado-pagina titulo="Tutores" subtitulo="Quiénes administran este grupo." />

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else {
        <ul class="mt-5 space-y-2">
          @for (t of tutores(); track t.id) {
            <li class="flex items-center gap-3 tarjeta">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca-100 text-marca-700 dark:bg-marca-900/40 dark:text-marca-300">
                <span class="h-5 w-5"><app-icono nombre="shield" /></span>
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold text-slate-900 dark:text-white">
                  {{ t.nombre }}
                  @if (t.id === auth.principalId()) {
                    <span class="text-xs font-normal text-slate-400 dark:text-slate-500">(vos)</span>
                  }
                </p>
                <p class="truncate text-xs text-slate-400 dark:text-slate-500">{{ t.email }}</p>
              </div>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {{ t.rol === 'ORG_ADMIN' ? 'Admin' : 'Tutor' }}
              </span>
              @if (auth.esOrgAdmin() && t.rol !== 'ORG_ADMIN' && t.id !== auth.principalId()) {
                <button
                  type="button"
                  (click)="aDesactivar.set(t)"
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  aria-label="Desactivar"
                >
                  <span class="h-4 w-4"><app-icono nombre="trash" /></span>
                </button>
              }
            </li>
          }
        </ul>
      }
    </section>

    <ui-confirm-dialog
      [abierto]="aDesactivar() !== null"
      titulo="Desactivar tutor"
      [mensaje]="'¿Desactivar a ' + (aDesactivar()?.nombre ?? '') + '? Perderá acceso a la organización.'"
      textoConfirmar="Desactivar"
      (confirmar)="confirmarDesactivar()"
      (cancelar)="aDesactivar.set(null)"
    />
  `,
})
export class TutoresPage {
  readonly grupoId = input.required<string>();

  protected readonly auth = inject(AuthService);

  private readonly api = inject(IdentityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly tutores = signal<TutorDto[]>([]);

  protected readonly aDesactivar = signal<TutorDto | null>(null);

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  protected confirmarDesactivar(): void {
    const t = this.aDesactivar();

    if (!t) {
      return;
    }

    this.api.desactivarTutor(t.id).subscribe({
      next: () => {
        this.toasts.exito('Tutor desactivado.');
        this.aDesactivar.set(null);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.aDesactivar.set(null);
      },
    });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);
    this.api.listarTutores(grupoId).subscribe({
      next: (t) => {
        this.tutores.set(t);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
