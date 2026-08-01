import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import {
  ModoRecompensas,
  TipoItemCatalogo,
  type RecompensaDto,
  type UmbralZonaDto,
} from '@dorado/shared-types';
import { ConfirmDialogComponent } from '@dorado/shared-ui';

import { IconoComponent } from '../../../componentes/icono.component';
import { ToastService } from '../../../componentes/toast.service';
import type { CrearRecompensaRequest } from '../../../core/api/api.types';
import { mensajeDeError } from '../../../core/api/errores';
import { RewardsApiService } from '../../../core/api/rewards-api.service';
import { ScoringApiService } from '../../../core/api/scoring-api.service';

interface FormItem {
  tipo: TipoItemCatalogo;
  umbralZonaId: string;
  nombre: string;
  descripcion: string;
  permiteSeleccion: boolean;
  permiteAzar: boolean;
}

const FORM_VACIO: FormItem = {
  tipo: TipoItemCatalogo.PREMIO,
  umbralZonaId: '',
  nombre: '',
  descripcion: '',
  permiteSeleccion: true,
  permiteAzar: false,
};

/**
 * Catálogo de ítems (fase-10, extendido por fase-14-22). Dos cambios respecto
 * de la versión original:
 *
 * - Cada ítem es `PREMIO` o `CASTIGO` (decisión 7), ortogonal al modo.
 * - La zona solo se pide en modo `DIRECTO` (decisión 13). En `TIENDA` el ítem
 *   no pertenece a ninguna zona, y los flags de selección/azar ni se muestran:
 *   ahí quien decide cómo se obtiene es el producto de la tienda.
 */
@Component({
  selector: 'app-catalogo-items',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconoComponent, ConfirmDialogComponent],
  template: `
    <div class="flex items-center justify-between">
      <p class="text-sm text-slate-500 dark:text-slate-400">
        {{
          esTienda()
            ? 'Premios y castigos. Los premios se venden en la tienda; los castigos alimentan el sorteo de la bancarrota.'
            : 'Lo que se gana al alcanzar una zona.'
        }}
      </p>
      <button
        type="button"
        (click)="abrirNueva()"
        [disabled]="!esTienda() && umbrales().length === 0"
        class="flex items-center gap-1.5 rounded-lg bg-marca-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
      >
        <span class="h-4 w-4"><app-icono nombre="plus" /></span>
        Nuevo
      </button>
    </div>

    @if (!esTienda() && umbrales().length === 0 && !cargando()) {
      <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
        Primero definí al menos una zona en «Zonas».
      </p>
    }

    @if (esTienda() && castigos().length === 0 && !cargando()) {
      <p class="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700">
        No hay castigos cargados: si alguien queda en negativo, su saldo vuelve a 0 y no pasa nada
        más. <b>Todos</b> los castigos activos entran al sorteo — para sacar uno, archivalo.
      </p>
    }

    @if (cargando()) {
      <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
    } @else if (items().length === 0) {
      <div class="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        Todavía no hay nada en el catálogo.
      </div>
    } @else {
      <ul class="mt-5 grid gap-3 sm:grid-cols-2">
        @for (r of items(); track r.id) {
          <li
            class="flex flex-col rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900"
            [class]="
              r.tipo === 'CASTIGO'
                ? 'border-red-200 dark:border-red-500/30'
                : 'border-slate-200 dark:border-slate-800'
            "
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate font-semibold text-slate-900 dark:text-white">{{ r.nombre }}</p>
                @if (r.descripcion) {
                  <p class="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{{ r.descripcion }}</p>
                }
              </div>
              @if (r.tipo === 'CASTIGO') {
                <span class="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                  Castigo
                </span>
              } @else if (r.nombreZonaSnapshot) {
                <span class="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  {{ r.nombreZonaSnapshot }}
                </span>
              }
            </div>

            @if (!esTienda()) {
              <div class="mt-3 flex flex-wrap gap-1.5 text-xs">
                @if (r.permiteSeleccion) {
                  <span class="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">Selección</span>
                }
                @if (r.permiteAzar) {
                  <span class="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">Azar</span>
                }
              </div>
            }

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

    @if (formAbierto()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <button type="button" aria-label="Cerrar" (click)="formAbierto.set(false)" class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"></button>
        <form
          (submit)="guardar($event)"
          class="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up dark:bg-slate-900 sm:rounded-2xl"
        >
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">
            {{ editando() ? 'Editar ítem' : 'Nuevo ítem' }}
          </h2>

          <div class="mt-4 space-y-3">
            <fieldset>
              <legend class="text-xs font-semibold text-slate-600 dark:text-slate-300">¿Qué es?</legend>
              <div class="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  (click)="form.tipo = TIPO.PREMIO"
                  [class]="claseOpcion(form.tipo === TIPO.PREMIO)"
                >
                  Premio
                </button>
                <button
                  type="button"
                  (click)="form.tipo = TIPO.CASTIGO"
                  [class]="claseOpcion(form.tipo === TIPO.CASTIGO)"
                >
                  Castigo
                </button>
              </div>
            </fieldset>

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

            @if (!esTienda()) {
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
            }
          </div>

          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              (click)="formAbierto.set(false)"
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
      titulo="Archivar ítem"
      [mensaje]="'¿Archivar «' + (aArchivar()?.nombre ?? '') + '»?'"
      textoConfirmar="Archivar"
      (confirmar)="confirmarArchivar()"
      (cancelar)="aArchivar.set(null)"
    />
  `,
})
export class CatalogoItemsComponent {
  readonly grupoId = input.required<string>();

  readonly modo = input.required<ModoRecompensas>();

  private readonly api = inject(RewardsApiService);

  private readonly scoring = inject(ScoringApiService);

  private readonly toasts = inject(ToastService);

  protected readonly TIPO = TipoItemCatalogo;

  protected readonly cargando = signal(true);

  protected readonly guardando = signal(false);

  protected readonly items = signal<RecompensaDto[]>([]);

  protected readonly umbrales = signal<UmbralZonaDto[]>([]);

  protected readonly formAbierto = signal(false);

  protected readonly editando = signal<RecompensaDto | null>(null);

  protected readonly aArchivar = signal<RecompensaDto | null>(null);

  protected readonly esTienda = computed(() => this.modo() === ModoRecompensas.TIENDA);

  protected readonly castigos = computed(() =>
    this.items().filter((i) => i.tipo === TipoItemCatalogo.CASTIGO)
  );

  protected form: FormItem = { ...FORM_VACIO };

  constructor() {
    effect(() => this.cargar(this.grupoId()));
  }

  protected claseOpcion(activa: boolean): string {
    return activa
      ? 'rounded-xl border-2 border-marca-500 bg-marca-50 px-3 py-2.5 text-sm font-semibold text-marca-800 transition dark:border-marca-400 dark:bg-marca-500/10 dark:text-marca-200'
      : 'rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800';
  }

  protected abrirNueva(): void {
    this.editando.set(null);
    this.form = { ...FORM_VACIO };
    this.formAbierto.set(true);
  }

  protected abrirEditar(item: RecompensaDto): void {
    this.editando.set(item);
    this.form = {
      tipo: item.tipo,
      // '' es el centinela de «sin zona» del form; en TIENDA no se pide.
      umbralZonaId: item.umbralZonaId ?? '',
      nombre: item.nombre,
      descripcion: item.descripcion ?? '',
      permiteSeleccion: item.permiteSeleccion,
      permiteAzar: item.permiteAzar,
    };
    this.formAbierto.set(true);
  }

  protected guardar(evento: Event): void {
    evento.preventDefault();

    if (this.form.nombre.trim().length === 0) {
      return;
    }

    if (!this.esTienda() && this.form.umbralZonaId === '') {
      return;
    }

    this.guardando.set(true);

    const actual = this.editando();
    const datos: CrearRecompensaRequest = {
      tipo: this.form.tipo,
      nombre: this.form.nombre.trim(),
      descripcion: this.form.descripcion.trim() || null,
      // En TIENDA el backend ignora la zona; no se manda para no confundir.
      ...(this.esTienda()
        ? {}
        : {
            umbralZonaId: this.form.umbralZonaId,
            permiteSeleccion: this.form.permiteSeleccion,
            permiteAzar: this.form.permiteAzar,
          }),
    };

    const peticion = actual
      ? this.api.editarRecompensa(actual.id, datos)
      : this.api.crearRecompensa(this.grupoId(), datos);

    peticion.subscribe({
      next: () => {
        this.toasts.exito(actual ? 'Ítem actualizado.' : 'Ítem creado.');
        this.guardando.set(false);
        this.formAbierto.set(false);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.guardando.set(false);
        this.toasts.error(mensajeDeError(e));
      },
    });
  }

  protected confirmarArchivar(): void {
    const item = this.aArchivar();

    if (!item) {
      return;
    }

    this.api.archivarRecompensa(item.id).subscribe({
      next: () => {
        this.toasts.exito('Ítem archivado.');
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
      items: this.api.listarRecompensas(grupoId, 'ACTIVA'),
      umbrales: this.scoring.listarUmbrales(grupoId),
    }).subscribe({
      next: ({ items, umbrales }) => {
        this.items.set(items);
        this.umbrales.set([...umbrales].sort((a, b) => a.orden - b.orden));
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
