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

import type { RecompensaDto, UmbralZonaDto } from '@dorado/shared-types';
import { ConfirmDialogComponent } from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import type { CrearRecompensaRequest } from '../../core/api/api.types';
import { mensajeDeError } from '../../core/api/errores';
import { RewardsApiService } from '../../core/api/rewards-api.service';
import { ScoringApiService } from '../../core/api/scoring-api.service';

interface FormRecompensa {
  umbralZonaId: string;
  nombre: string;
  descripcion: string;
  permiteSeleccion: boolean;
  permiteAzar: boolean;
}

const FORM_VACIO: FormRecompensa = {
  umbralZonaId: '',
  nombre: '',
  descripcion: '',
  permiteSeleccion: true,
  permiteAzar: false,
};

/** CRUD de Recompensas (fase-10). La zona se elige de los umbrales del grupo. */
@Component({
  selector: 'app-recompensas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, EncabezadoPaginaComponent, IconoComponent, ConfirmDialogComponent],
  template: `
    <section class="mx-auto max-w-4xl px-4 py-6">
      <app-encabezado-pagina titulo="Recompensas" subtitulo="Lo que se gana al alcanzar una zona.">
        <button
          type="button"
          (click)="abrirNueva()"
          [disabled]="umbrales().length === 0"
          class="flex items-center gap-1.5 rounded-lg bg-marca-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
        >
          <span class="h-4 w-4"><app-icono nombre="plus" /></span>
          Nueva
        </button>
      </app-encabezado-pagina>

      @if (umbrales().length === 0 && !cargando()) {
        <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
          Primero definí al menos una zona en «Zonas» para poder crear recompensas.
        </p>
      }

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (recompensas().length === 0) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Todavía no hay recompensas.
        </div>
      } @else {
        <ul class="mt-5 grid gap-3 sm:grid-cols-2">
          @for (r of recompensas(); track r.id) {
            <li class="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate font-semibold text-slate-900 dark:text-white">{{ r.nombre }}</p>
                  @if (r.descripcion) {
                    <p class="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{{ r.descripcion }}</p>
                  }
                </div>
                <span class="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  {{ r.nombreZonaSnapshot }}
                </span>
              </div>

              <div class="mt-3 flex flex-wrap gap-1.5 text-xs">
                @if (r.permiteSeleccion) {
                  <span class="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">Selección</span>
                }
                @if (r.permiteAzar) {
                  <span class="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">Azar</span>
                }
              </div>

              <div class="mt-3 flex justify-end gap-1 border-t border-slate-50 pt-2 dark:border-slate-800">
                <button
                  type="button"
                  (click)="abrirEditar(r)"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-marca-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-marca-300"
                  aria-label="Editar"
                >
                  <span class="h-4 w-4"><app-icono nombre="pencil" /></span>
                </button>
                <button
                  type="button"
                  (click)="aArchivar.set(r)"
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
            {{ editando() ? 'Editar recompensa' : 'Nueva recompensa' }}
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

            <label class="block">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Descripción (opcional)</span>
              <textarea
                [(ngModel)]="form.descripcion"
                name="descripcion"
                rows="2"
                maxlength="500"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              ></textarea>
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Zona</span>
              <select
                [(ngModel)]="form.umbralZonaId"
                name="umbralZonaId"
                required
                [disabled]="editando() !== null"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-60 focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              >
                <option value="" disabled>Elegí una zona…</option>
                @for (u of umbrales(); track u.id) {
                  <option [value]="u.id">{{ u.nombreZona }}</option>
                }
              </select>
            </label>

            <div class="flex gap-2">
              <label class="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <input
                  [(ngModel)]="form.permiteSeleccion"
                  name="permiteSeleccion"
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500 dark:border-slate-600"
                />
                <span class="text-sm text-slate-700 dark:text-slate-200">Selección</span>
              </label>
              <label class="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <input
                  [(ngModel)]="form.permiteAzar"
                  name="permiteAzar"
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500 dark:border-slate-600"
                />
                <span class="text-sm text-slate-700 dark:text-slate-200">Azar</span>
              </label>
            </div>
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
      titulo="Archivar recompensa"
      [mensaje]="'¿Archivar «' + (aArchivar()?.nombre ?? '') + '»?'"
      textoConfirmar="Archivar"
      (confirmar)="confirmarArchivar()"
      (cancelar)="aArchivar.set(null)"
    />
  `,
})
export class RecompensasPage {
  readonly grupoId = input.required<string>();

  private readonly api = inject(RewardsApiService);

  private readonly scoring = inject(ScoringApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly recompensas = signal<RecompensaDto[]>([]);

  protected readonly umbrales = signal<UmbralZonaDto[]>([]);

  protected readonly formAbierto = signal(false);

  protected readonly guardando = signal(false);

  protected readonly editando = signal<RecompensaDto | null>(null);

  protected readonly aArchivar = signal<RecompensaDto | null>(null);

  protected form: FormRecompensa = { ...FORM_VACIO };

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  protected abrirNueva(): void {
    this.editando.set(null);
    this.form = { ...FORM_VACIO };
    this.formAbierto.set(true);
  }

  protected abrirEditar(r: RecompensaDto): void {
    this.editando.set(r);
    this.form = {
      // fase-14-22: la zona es null en los ítems de un grupo en modo TIENDA.
      // '' es el centinela de "sin zona elegida" del form, y la validación de
      // guardar ya lo rechaza — esta pantalla es la del modo DIRECTO.
      umbralZonaId: r.umbralZonaId ?? '',
      nombre: r.nombre,
      descripcion: r.descripcion ?? '',
      permiteSeleccion: r.permiteSeleccion,
      permiteAzar: r.permiteAzar,
    };
    this.formAbierto.set(true);
  }

  protected cerrarForm(): void {
    this.formAbierto.set(false);
  }

  protected guardar(evento: Event): void {
    evento.preventDefault();

    if (this.form.nombre.trim().length === 0 || this.form.umbralZonaId === '') {
      return;
    }

    this.guardando.set(true);
    const actual = this.editando();
    const datos: CrearRecompensaRequest = {
      umbralZonaId: this.form.umbralZonaId,
      nombre: this.form.nombre.trim(),
      descripcion: this.form.descripcion.trim() || null,
      permiteSeleccion: this.form.permiteSeleccion,
      permiteAzar: this.form.permiteAzar,
    };

    const peticion = actual
      ? this.api.editarRecompensa(actual.id, datos)
      : this.api.crearRecompensa(this.grupoId(), datos);

    peticion.subscribe({
      next: () => {
        this.toasts.exito(actual ? 'Recompensa actualizada.' : 'Recompensa creada.');
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
    const r = this.aArchivar();

    if (!r) {
      return;
    }

    this.api.archivarRecompensa(r.id).subscribe({
      next: () => {
        this.toasts.exito('Recompensa archivada.');
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
    forkJoin({
      recompensas: this.api.listarRecompensas(grupoId, 'ACTIVA'),
      umbrales: this.scoring.listarUmbrales(grupoId),
    }).subscribe({
      next: ({ recompensas, umbrales }) => {
        this.recompensas.set(recompensas);
        this.umbrales.set([...umbrales].sort((a, b) => a.orden - b.orden));
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
