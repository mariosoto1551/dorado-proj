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
import { forkJoin, map, of, switchMap } from 'rxjs';

import {
  ModoRecompensas,
  TipoItemCatalogo,
  type EtiquetaCatalogoDto,
  type RecompensaDto,
  type UmbralZonaDto,
} from '@dorado/shared-types';
import { ConfirmDialogComponent, EstadoVacioComponent, CampoComponent, ModalComponent } from '@dorado/shared-ui';

import { IconoComponent } from '../../../componentes/icono.component';
import { ToastService } from '../../../componentes/toast.service';
import type { CrearRecompensaRequest } from '../../../core/api/api.types';
import { mensajeDeError } from '../../../core/api/errores';
import { RewardsApiService } from '../../../core/api/rewards-api.service';
import { ScoringApiService } from '../../../core/api/scoring-api.service';
import { conEtiqueta } from '../../../core/etiquetas-catalogo';
import { EtiquetaChipComponent } from './etiqueta-chip.component';
import { EtiquetasGestorComponent } from './etiquetas-gestor.component';

interface FormItem {
  tipo: TipoItemCatalogo;
  umbralZonaId: string;
  nombre: string;
  descripcion: string;
  permiteSeleccion: boolean;
  permiteAzar: boolean;
  /** fase-14-26: se guardan con un PUT aparte, después de crear/editar. */
  etiquetaIds: string[];
}

const FORM_VACIO: FormItem = {
  tipo: TipoItemCatalogo.PREMIO,
  umbralZonaId: '',
  nombre: '',
  descripcion: '',
  permiteSeleccion: true,
  permiteAzar: false,
  etiquetaIds: [],
};

/** Tope de interfaz, espejo del backend (`MAX_ETIQUETAS_POR_ITEM`). */
const MAX_ETIQUETAS = 5;

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
  imports: [
    ModalComponent,
    CampoComponent,
    EstadoVacioComponent,
    FormsModule,
    IconoComponent,
    ConfirmDialogComponent,
    EtiquetaChipComponent,
    EtiquetasGestorComponent,
  ],
  template: `
    <div class="flex items-center justify-between">
      <p class="text-sm text-slate-500 dark:text-slate-400">
        {{
          esTienda()
            ? 'Premios y castigos. Los premios se venden en la tienda; los castigos alimentan el sorteo de la bancarrota.'
            : 'Lo que se gana al alcanzar una zona.'
        }}
      </p>
      <div class="flex items-center gap-2">
        <button type="button" (click)="gestorAbierto.set(true)" class="boton boton-neutro">
          Etiquetas
        </button>
        <button
          type="button"
          (click)="abrirNueva()"
          [disabled]="!esTienda() && umbrales().length === 0"
          class="boton boton-primario"
        >
          <span class="h-4 w-4"><app-icono nombre="plus" /></span>
          Nuevo
        </button>
      </div>
    </div>

    <!--
      fase-14-26: la fila de filtros NO se muestra si el grupo no tiene
      etiquetas. Un filtro vacío es ruido para quien no usa el ítem, y el
      criterio de aceptación 10 pide que esa pantalla quede igual que antes.
    -->
    @if (etiquetas().length > 0) {
      <div class="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          (click)="filtro.set(null)"
          [class]="claseFiltroTodas()"
        >
          Todas
        </button>
        @for (e of etiquetas(); track e.id) {
          <button
            type="button"
            (click)="filtro.set(filtro() === e.id ? null : e.id)"
            [attr.aria-pressed]="filtro() === e.id"
          >
            <app-etiqueta-chip [etiqueta]="e" [activa]="filtro() === e.id" />
          </button>
        }
      </div>
    }

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
    } @else if (visibles().length === 0) {
      <ui-estado-vacio class="mt-5">
        {{
          filtro()
            ? 'Ningún ítem tiene esa etiqueta.'
            : 'Todavía no hay nada en el catálogo.'
        }}
      </ui-estado-vacio>
    } @else {
      <ul class="mt-5 grid gap-3 sm:grid-cols-2">
        @for (r of visibles(); track r.id) {
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

            @if (r.etiquetas.length > 0) {
              <div class="mt-2 flex flex-wrap gap-1">
                @for (e of r.etiquetas; track e.id) {
                  <app-etiqueta-chip [etiqueta]="e" />
                }
              </div>
            }

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

    <ui-modal
      [abierto]="formAbierto()"
      [titulo]="editando() ? 'Editar ítem' : 'Nuevo ítem'"
      (cerrar)="formAbierto.set(false)"
    >
      @if (formAbierto()) {
        <form (submit)="guardar($event)">
  
            <div class="mt-4 space-y-3">
              <fieldset>
                <legend class="etiqueta-campo">¿Qué es?</legend>
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
  
              <ui-campo etiqueta="Nombre">
                <input
                  [(ngModel)]="form.nombre"
                  name="nombre"
                  required
                  maxlength="120"
                  class="campo"
                />
              </ui-campo>
  
              <ui-campo etiqueta="Descripción (opcional)">
                <textarea
                  [(ngModel)]="form.descripcion"
                  name="descripcion"
                  rows="2"
                  maxlength="500"
                  class="campo"
                ></textarea>
              </ui-campo>

              @if (etiquetas().length > 0) {
                <fieldset>
                  <legend class="etiqueta-campo">
                    Etiquetas ({{ form.etiquetaIds.length }} de {{ MAX_ETIQUETAS }})
                  </legend>
                  <div class="mt-1.5 flex flex-wrap gap-1.5">
                    @for (e of etiquetas(); track e.id) {
                      <button
                        type="button"
                        (click)="alternarEtiqueta(e.id)"
                        [attr.aria-pressed]="form.etiquetaIds.includes(e.id)"
                        [disabled]="!form.etiquetaIds.includes(e.id) && form.etiquetaIds.length >= MAX_ETIQUETAS"
                        class="disabled:opacity-40"
                      >
                        <app-etiqueta-chip
                          [etiqueta]="e"
                          [activa]="form.etiquetaIds.includes(e.id)"
                        />
                      </button>
                    }
                  </div>
                </fieldset>
              }

              @if (!esTienda()) {
                <ui-campo etiqueta="Zona">
                  <select
                    [(ngModel)]="form.umbralZonaId"
                    name="umbralZonaId"
                    required
                    [disabled]="editando() !== null"
                    class="campo"
                  >
                    <option value="" disabled>Elegí una zona…</option>
                    @for (u of umbrales(); track u.id) {
                      <option [value]="u.id">{{ u.nombreZona }}</option>
                    }
                  </select>
                </ui-campo>
  
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
  
          <div class="botonera">
            <button type="button" (click)="formAbierto.set(false)" class="boton boton-neutro">
              Cancelar
            </button>
            <button type="submit" [disabled]="guardando()" class="boton boton-primario">
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      }
    </ui-modal>

    <ui-confirm-dialog
      [abierto]="aArchivar() !== null"
      titulo="Archivar ítem"
      [mensaje]="'¿Archivar «' + (aArchivar()?.nombre ?? '') + '»?'"
      textoConfirmar="Archivar"
      (confirmar)="confirmarArchivar()"
      (cancelar)="aArchivar.set(null)"
    />

    <app-etiquetas-gestor
      [grupoId]="grupoId()"
      [abierto]="gestorAbierto()"
      (cerrar)="gestorAbierto.set(false)"
      (cambio)="cargar(grupoId())"
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

  protected readonly MAX_ETIQUETAS = MAX_ETIQUETAS;

  /** Solo las ACTIVAS: las archivadas se recuperan desde el gestor. */
  protected readonly etiquetas = signal<EtiquetaCatalogoDto[]>([]);

  /** Etiqueta del filtro, `null` = «Todas» (decisión 9: una por vez). */
  protected readonly filtro = signal<string | null>(null);

  protected readonly gestorAbierto = signal(false);

  protected readonly esTienda = computed(() => this.modo() === ModoRecompensas.TIENDA);

  protected readonly castigos = computed(() =>
    this.items().filter((i) => i.tipo === TipoItemCatalogo.CASTIGO)
  );

  /**
   * El filtro se aplica en el cliente sobre la lista ya cargada. El endpoint
   * también lo soporta (`?etiquetaId=`) y lo usa la E2E, pero acá tocar un chip
   * no debería costar un viaje al servidor: el catálogo de un grupo entra
   * entero en memoria y el filtro es instantáneo.
   */
  protected readonly visibles = computed(() => {
    const etiquetaId = this.filtro();

    return etiquetaId ? conEtiqueta(this.items(), etiquetaId) : this.items();
  });

  protected form: FormItem = { ...FORM_VACIO };

  constructor() {
    effect(() => this.cargar(this.grupoId()));
  }

  protected claseFiltroTodas(): string {
    return this.filtro() === null
      ? 'rounded-full border border-marca-500 bg-marca-50 px-2.5 py-0.5 text-xs font-semibold text-marca-700 dark:border-marca-400 dark:bg-marca-500/15 dark:text-marca-200'
      : 'rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800';
  }

  protected alternarEtiqueta(id: string): void {
    const elegidas = this.form.etiquetaIds;

    if (elegidas.includes(id)) {
      this.form.etiquetaIds = elegidas.filter((otra) => otra !== id);

      return;
    }

    if (elegidas.length >= MAX_ETIQUETAS) {
      return;
    }

    this.form.etiquetaIds = [...elegidas, id];
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
      etiquetaIds: item.etiquetas.map((etiqueta) => etiqueta.id),
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

    // fase-14-26: las etiquetas van en un PUT aparte sobre el sub-recurso (el
    // PATCH del ítem no puede distinguir «sin etiquetas» de «no lo mandé»), y
    // se encadena para que el Tutor siga viendo un solo botón de guardar — la
    // T1 del #23 corrigió exactamente el defecto contrario en turnos.
    const etiquetaIds = this.form.etiquetaIds;
    const conEtiquetas = peticion.pipe(
      switchMap((item) =>
        this.etiquetas().length === 0
          ? of(item)
          : this.api.asignarEtiquetas(item.id, { etiquetaIds }).pipe(map(() => item))
      )
    );

    conEtiquetas.subscribe({
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

  /**
   * Pública porque la llama el gestor de etiquetas al cerrar un cambio:
   * renombrar una etiqueta tiene que repintar los chips de todas las tarjetas.
   */
  protected cargar(grupoId: string): void {
    this.cargando.set(true);

    forkJoin({
      items: this.api.listarRecompensas(grupoId, 'ACTIVA'),
      umbrales: this.scoring.listarUmbrales(grupoId),
      etiquetas: this.api.listarEtiquetas(grupoId, 'ACTIVA'),
    }).subscribe({
      next: ({ items, umbrales, etiquetas }) => {
        this.items.set(items);
        this.umbrales.set([...umbrales].sort((a, b) => a.orden - b.orden));
        this.etiquetas.set(etiquetas);

        // Si la etiqueta filtrada se archivó, el filtro vuelve a «Todas» en vez
        // de dejar la grilla vacía sin explicación.
        if (this.filtro() && !etiquetas.some((e) => e.id === this.filtro())) {
          this.filtro.set(null);
        }

        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
