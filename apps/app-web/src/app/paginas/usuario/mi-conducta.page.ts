import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { type ConductaDto, TipoConducta } from '@dorado/shared-types';

import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';

/** Autoreporte de mala conducta (fase-10): solo conductas MALA autoreportables. */
@Component({
  selector: 'app-mi-conducta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    <section class="mx-auto max-w-xl px-4 py-5">
      <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Mi conducta</h1>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Si te mandaste una macana, reportala acá. Suma honestidad. 🙌</p>

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (autoreportables().length === 0) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          No hay conductas para autoreportar.
        </div>
      } @else {
        <ul class="mt-5 space-y-2.5">
          @for (c of autoreportables(); track c.id) {
            <li class="flex items-center gap-3 rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-400">
                <span class="h-5 w-5"><app-icono nombre="flag" /></span>
              </span>
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-slate-900 dark:text-white">{{ c.nombre }}</p>
                <p class="text-xs font-medium text-red-500 dark:text-red-400">−{{ c.valorPuntos }} pts</p>
              </div>
              <button
                type="button"
                (click)="reportar(c)"
                [disabled]="procesando()"
                class="shrink-0 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Reportar
              </button>
            </li>
          }
        </ul>
      }

      @if (reportadas().length > 0) {
        <h2 class="mt-8 mb-2 text-sm font-bold text-slate-500 uppercase dark:text-slate-400">Reportado hoy</h2>
        <ul class="space-y-1.5">
          @for (nombre of reportadas(); track $index) {
            <li class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">{{ nombre }}</li>
          }
        </ul>
      }
    </section>
  `,
})
export class MiConductaPage {
  private readonly auth = inject(AuthService);

  private readonly activity = inject(ActivityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly procesando = signal(false);

  private readonly conductas = signal<ConductaDto[]>([]);

  protected readonly reportadas = signal<string[]>([]);

  protected readonly autoreportables = computed(() =>
    this.conductas().filter((c) => c.tipo === TipoConducta.MALA && c.permiteAutoreporte)
  );

  constructor() {
    this.cargar();
  }

  protected reportar(c: ConductaDto): void {
    this.procesando.set(true);
    this.activity.registrarConducta(c.id).subscribe({
      next: () => {
        this.reportadas.update((l) => [c.nombre, ...l]);
        this.procesando.set(false);
        this.toasts.exito('Reportado. ¡Gracias por la honestidad!');
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  private cargar(): void {
    const grupoId = this.auth.grupoUsuario();

    if (!grupoId) {
      this.cargando.set(false);

      return;
    }

    this.activity.listarConductas(grupoId).subscribe({
      next: (c) => {
        this.conductas.set(c);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
