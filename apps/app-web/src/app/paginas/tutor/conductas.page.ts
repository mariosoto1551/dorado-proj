import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { type ConductaDto, TipoConducta } from '@dorado/shared-types';
import { ConfirmDialogComponent } from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import type { CrearConductaRequest } from '../../core/api/api.types';
import { mensajeDeError } from '../../core/api/errores';

interface FormConducta {
  nombre: string;
  tipo: TipoConducta;
  valorPuntos: number;
  permiteAutoreporte: boolean;
}

const FORM_VACIO: FormConducta = {
  nombre: '',
  tipo: TipoConducta.MALA,
  valorPuntos: 5,
  permiteAutoreporte: false,
};

/** CRUD de Conductas (fase-10). Autoreporte se deshabilita si tipo=BUENA (regla fase-05). */
@Component({
  selector: 'app-conductas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, EncabezadoPaginaComponent, IconoComponent, ConfirmDialogComponent],
  template: `
    <section class="mx-auto max-w-4xl px-4 py-6">
      <app-encabezado-pagina titulo="Conductas" subtitulo="Suman o restan puntos según el comportamiento.">
        <button
          type="button"
          (click)="abrirNueva()"
          class="flex items-center gap-1.5 rounded-lg bg-marca-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-marca-700"
        >
          <span class="h-4 w-4"><app-icono nombre="plus" /></span>
          Nueva
        </button>
      </app-encabezado-pagina>

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (conductas().length === 0) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Todavía no hay conductas.
        </div>
      } @else {
        <ul class="mt-5 grid gap-3 sm:grid-cols-2">
          @for (c of conductas(); track c.id) {
            <li class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                [class]="c.tipo === 'BUENA' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400'"
              >
                <span class="h-5 w-5"><app-icono nombre="flag" /></span>
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold text-slate-900 dark:text-white">{{ c.nombre }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ c.tipo === 'BUENA' ? 'Buena' : 'Mala' }}
                  @if (c.permiteAutoreporte) {
                    · autoreportable
                  }
                </p>
              </div>
              <span
                class="shrink-0 rounded-full px-2.5 py-1 text-sm font-bold"
                [class]="c.tipo === 'BUENA' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'"
              >
                {{ c.tipo === 'BUENA' ? '+' : '−' }}{{ c.valorPuntos }}
              </span>
              <div class="flex shrink-0 gap-1">
                <button
                  type="button"
                  (click)="abrirEditar(c)"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-marca-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-marca-300"
                  aria-label="Editar"
                >
                  <span class="h-4 w-4"><app-icono nombre="pencil" /></span>
                </button>
                <button
                  type="button"
                  (click)="aArchivar.set(c)"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  aria-label="Archivar"
                >
                  <span class="h-4 w-4"><app-icono nombre="trash" /></span>
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </section>

    @if (formAbierto()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <button
          type="button"
          aria-label="Cerrar"
          (click)="cerrarForm()"
          class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"
        ></button>
        <form
          (submit)="guardar($event)"
          class="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up dark:bg-slate-900 sm:rounded-2xl"
        >
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">
            {{ editando() ? 'Editar conducta' : 'Nueva conducta' }}
          </h2>

          <div class="mt-4 space-y-3">
            <label class="block">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Nombre</span>
              <input
                [(ngModel)]="form.nombre"
                name="nombre"
                required
                maxlength="120"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              />
            </label>

            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Tipo</span>
                <select
                  [(ngModel)]="form.tipo"
                  name="tipo"
                  (ngModelChange)="onTipoCambio()"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                >
                  <option [ngValue]="TC.BUENA">Buena (+)</option>
                  <option [ngValue]="TC.MALA">Mala (−)</option>
                </select>
              </label>
              <label class="block">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Puntos</span>
                <input
                  [(ngModel)]="form.valorPuntos"
                  name="valorPuntos"
                  type="number"
                  min="1"
                  required
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                />
              </label>
            </div>

            <label
              class="flex items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
              [class.opacity-40]="form.tipo === TC.BUENA"
            >
              <input
                [(ngModel)]="form.permiteAutoreporte"
                name="permiteAutoreporte"
                type="checkbox"
                [disabled]="form.tipo === TC.BUENA"
                class="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500 dark:border-slate-600"
              />
              <span class="text-sm text-slate-700 dark:text-slate-200">
                El usuario puede autoreportarla
                <span class="block text-xs text-slate-400 dark:text-slate-500">Solo aplica a conductas malas.</span>
              </span>
            </label>
          </div>

          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              (click)="cerrarForm()"
              class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="guardando()"
              class="rounded-lg bg-marca-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
            >
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    }

    <ui-confirm-dialog
      [abierto]="aArchivar() !== null"
      titulo="Archivar conducta"
      [mensaje]="'¿Archivar «' + (aArchivar()?.nombre ?? '') + '»?'"
      textoConfirmar="Archivar"
      (confirmar)="confirmarArchivar()"
      (cancelar)="aArchivar.set(null)"
    />
  `,
})
export class ConductasPage {
  readonly grupoId = input.required<string>();

  protected readonly TC = TipoConducta;

  private readonly api = inject(ActivityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly conductas = signal<ConductaDto[]>([]);

  protected readonly formAbierto = signal(false);

  protected readonly guardando = signal(false);

  protected readonly editando = signal<ConductaDto | null>(null);

  protected readonly aArchivar = signal<ConductaDto | null>(null);

  protected form: FormConducta = { ...FORM_VACIO };

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  protected onTipoCambio(): void {
    if (this.form.tipo === TipoConducta.BUENA) {
      this.form.permiteAutoreporte = false;
    }
  }

  protected abrirNueva(): void {
    this.editando.set(null);
    this.form = { ...FORM_VACIO };
    this.formAbierto.set(true);
  }

  protected abrirEditar(c: ConductaDto): void {
    this.editando.set(c);
    this.form = {
      nombre: c.nombre,
      tipo: c.tipo,
      valorPuntos: c.valorPuntos,
      permiteAutoreporte: c.permiteAutoreporte,
    };
    this.formAbierto.set(true);
  }

  protected cerrarForm(): void {
    this.formAbierto.set(false);
  }

  protected guardar(evento: Event): void {
    evento.preventDefault();

    if (this.form.nombre.trim().length === 0) {
      return;
    }

    this.guardando.set(true);
    const datos: CrearConductaRequest = {
      nombre: this.form.nombre.trim(),
      tipo: this.form.tipo,
      valorPuntos: Number(this.form.valorPuntos),
      permiteAutoreporte: this.form.tipo === TipoConducta.MALA ? this.form.permiteAutoreporte : false,
    };
    const actual = this.editando();

    const peticion = actual
      ? this.api.editarConducta(actual.id, datos)
      : this.api.crearConducta(this.grupoId(), datos);

    peticion.subscribe({
      next: () => {
        this.toasts.exito(actual ? 'Conducta actualizada.' : 'Conducta creada.');
        this.guardando.set(false);
        this.formAbierto.set(false);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.guardando.set(false);
      },
    });
  }

  protected confirmarArchivar(): void {
    const c = this.aArchivar();

    if (!c) {
      return;
    }

    this.api.archivarConducta(c.id).subscribe({
      next: () => {
        this.toasts.exito('Conducta archivada.');
        this.aArchivar.set(null);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.aArchivar.set(null);
      },
    });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);
    this.api.listarConductas(grupoId, 'ACTIVA').subscribe({
      next: (c) => {
        this.conductas.set(c);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
