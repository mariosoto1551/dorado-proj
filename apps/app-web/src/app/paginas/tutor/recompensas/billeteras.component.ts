import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import type { BilleteraDto, UsuarioDto } from '@dorado/shared-types';

import { ToastService } from '../../../componentes/toast.service';
import { mensajeDeError } from '../../../core/api/errores';
import { IdentityApiService } from '../../../core/api/identity-api.service';
import { RewardsApiService } from '../../../core/api/rewards-api.service';

/**
 * Saldo de cada integrante + ajuste manual (fase-14-22). El ajuste exige
 * motivo y **no puede dejar el saldo en negativo**: la única deuda que el
 * sistema permite es la del cierre, y esa se salda sola.
 */
@Component({
  selector: 'app-billeteras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <p class="text-sm text-slate-500 dark:text-slate-400">
      Cuánto tiene cada integrante y ajustes a mano.
    </p>

    @if (cargando()) {
      <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
    } @else if (billeteras().length === 0) {
      <div class="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        Todavía no hay integrantes en el grupo.
      </div>
    } @else {
      <ul class="mt-5 space-y-2">
        @for (b of billeteras(); track b.usuarioId) {
          <li class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <span class="flex-1 truncate font-semibold text-slate-900 dark:text-white">
              {{ nombreDe(b.usuarioId) }}
            </span>
            <span class="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              {{ b.iconoMoneda }} {{ b.saldo }}
            </span>
            <button
              type="button"
              (click)="abrirAjuste(b)"
              class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Ajustar
            </button>
          </li>
        }
      </ul>
    }

    @if (ajustando(); as billetera) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <button type="button" aria-label="Cerrar" (click)="ajustando.set(null)" class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"></button>
        <form
          (submit)="guardarAjuste($event)"
          class="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up dark:bg-slate-900 sm:rounded-2xl"
        >
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">
            Ajustar a {{ nombreDe(billetera.usuarioId) }}
          </h2>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tiene {{ billetera.saldo }} {{ billetera.nombreMoneda }}. Un ajuste negativo no puede
            dejarlo por debajo de 0.
          </p>

          <div class="mt-4 space-y-3">
            <label class="block">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Monto (negativo para descontar)
              </span>
              <input
                type="number"
                [(ngModel)]="monto"
                name="monto"
                class="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              />
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Motivo</span>
              <input
                [(ngModel)]="motivo"
                name="motivo"
                required
                maxlength="200"
                placeholder="Ej: ayudó con la mudanza"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              />
            </label>
          </div>

          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              (click)="ajustando.set(null)"
              class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="guardando() || motivo.trim().length === 0 || monto === 0"
              class="rounded-lg bg-marca-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
            >
              {{ guardando() ? 'Guardando…' : 'Ajustar' }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
})
export class BilleterasComponent {
  readonly grupoId = input.required<string>();

  private readonly api = inject(RewardsApiService);

  private readonly identity = inject(IdentityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly guardando = signal(false);

  protected readonly billeteras = signal<BilleteraDto[]>([]);

  protected readonly ajustando = signal<BilleteraDto | null>(null);

  private readonly usuarios = signal<UsuarioDto[]>([]);

  protected monto = 0;

  protected motivo = '';

  constructor() {
    effect(() => this.cargar(this.grupoId()));
  }

  protected nombreDe(usuarioId: string): string {
    return this.usuarios().find((u) => u.id === usuarioId)?.nombre ?? 'Integrante';
  }

  protected abrirAjuste(billetera: BilleteraDto): void {
    this.ajustando.set(billetera);
    this.monto = 0;
    this.motivo = '';
  }

  protected guardarAjuste(evento: Event): void {
    evento.preventDefault();

    const billetera = this.ajustando();

    if (!billetera || this.motivo.trim().length === 0 || Number(this.monto) === 0) {
      return;
    }

    this.guardando.set(true);

    this.api
      .ajustarMonedas(this.grupoId(), billetera.usuarioId, {
        monto: Number(this.monto),
        motivo: this.motivo.trim(),
      })
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.ajustando.set(null);
          this.toasts.exito('Ajuste aplicado.');
          this.cargar(this.grupoId());
        },
        error: (e) => {
          this.guardando.set(false);
          this.toasts.error(mensajeDeError(e));
        },
      });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);

    forkJoin({
      billeteras: this.api.billeteras(grupoId),
      usuarios: this.identity.listarUsuarios(grupoId),
    }).subscribe({
      next: ({ billeteras, usuarios }) => {
        this.billeteras.set(billeteras);
        this.usuarios.set(usuarios);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
