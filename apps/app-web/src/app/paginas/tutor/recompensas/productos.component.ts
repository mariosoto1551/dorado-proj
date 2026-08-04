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
  FuenteProducto,
  MecanicaProducto,
  TipoItemCatalogo,
  type BolsaPremiosDto,
  type EtiquetaCatalogoDto,
  type ProductoTiendaDto,
  type RecompensaDto,
  type RendimientoZonaDto,
} from '@dorado/shared-types';

import { IconoComponent } from '../../../componentes/icono.component';
import { ToastService } from '../../../componentes/toast.service';
import { mensajeDeError } from '../../../core/api/errores';
import { RewardsApiService } from '../../../core/api/rewards-api.service';
import { particionarParaTienda } from '../../../core/etiquetas-catalogo';
import {
  ConfirmDialogComponent,
  EstadoVacioComponent,
  CampoComponent,
  ModalComponent,
} from '@dorado/shared-ui';
import { EtiquetaChipComponent } from './etiqueta-chip.component';

interface FormProducto {
  nombre: string;
  descripcion: string;
  precio: number;
  fuente: FuenteProducto;
  mecanica: MecanicaProducto;
  recompensaId: string;
  bolsaId: string;
}

const FORM_VACIO: FormProducto = {
  nombre: '',
  descripcion: '',
  precio: 10,
  fuente: FuenteProducto.ITEM,
  mecanica: MecanicaProducto.AZAR,
  recompensaId: '',
  bolsaId: '',
};

/**
 * La tienda (fase-14-22 decisión 18). El formulario son DOS PREGUNTAS, no una
 * lista de tipos: «¿de dónde sale?» y «¿cómo se obtiene?» — y la segunda
 * desaparece cuando la primera es un ítem puntual. Así el modelo de dos ejes
 * no se siente como dos campos técnicos.
 */
@Component({
  selector: 'app-productos-tienda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ModalComponent,
    ConfirmDialogComponent,
    CampoComponent,
    EstadoVacioComponent,
    FormsModule,
    IconoComponent,
    EtiquetaChipComponent,
  ],
  template: `
    <div class="flex items-center justify-between">
      <p class="text-sm text-slate-500 dark:text-slate-400">Lo que los integrantes pueden comprar.</p>
      <div class="flex items-center gap-2">
        @if (etiquetas().length > 0) {
          <button type="button" (click)="abrirDesdeEtiqueta()" class="boton boton-neutro">
            Desde una etiqueta
          </button>
        }
        <button
          type="button"
          (click)="abrirNuevo()"
          class="boton boton-primario"
        >
          <span class="h-4 w-4"><app-icono nombre="plus" /></span>
          Nuevo producto
        </button>
      </div>
    </div>

    @if (cargando()) {
      <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
    } @else if (productos().length === 0) {
      <ui-estado-vacio class="mt-5">
        La tienda está vacía.
      </ui-estado-vacio>
    } @else {
      <ul class="mt-5 grid gap-3 sm:grid-cols-2">
        @for (p of productos(); track p.id) {
          <li class="tarjeta">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate font-semibold text-slate-900 dark:text-white">{{ p.nombre }}</p>
                <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{{ descripcionDe(p) }}</p>
              </div>
              <span class="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                {{ p.precio }}
              </span>
            </div>

            <p class="mt-2 text-xs text-slate-400 dark:text-slate-500">{{ semanasPara(p.precio) }}</p>

            <div class="mt-3 flex justify-end gap-1 border-t border-slate-50 pt-2 dark:border-slate-800">
              <button
                type="button"
                (click)="abrirEditar(p)"
                class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-marca-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-marca-300"
                aria-label="Editar"
              >
                <span class="h-4 w-4"><app-icono nombre="pencil" /></span>
              </button>
              <button
                type="button"
                (click)="aArchivar.set(p)"
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
      [titulo]="editando() ? 'Editar producto' : 'Nuevo producto'"
      (cerrar)="formAbierto.set(false)"
    >
      @if (formAbierto()) {
        <form (submit)="guardar($event)">
  
            <div class="mt-4 space-y-3">
              <ui-campo etiqueta="Nombre">
                <input
                  [(ngModel)]="form.nombre"
                  name="nombre"
                  required
                  maxlength="120"
                  class="campo"
                />
              </ui-campo>
  
              <ui-campo etiqueta="Precio">
                <input
                  type="number"
                  min="1"
                  [(ngModel)]="form.precio"
                  name="precio"
                  class="w-32 campo"
                />
                <span class="ml-2 text-xs text-slate-400 dark:text-slate-500">{{ semanasPara(form.precio) }}</span>
              </ui-campo>
  
              <!-- Pregunta 1: ¿de dónde sale? -->
              <fieldset>
                <legend class="etiqueta-campo">¿De dónde sale?</legend>
                <div class="mt-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    (click)="form.fuente = FUENTE.ITEM"
                    [class]="claseOpcion(form.fuente === FUENTE.ITEM)"
                  >
                    Un premio puntual
                  </button>
                  <button
                    type="button"
                    (click)="form.fuente = FUENTE.BOLSA"
                    [disabled]="bolsas().length === 0"
                    [class]="claseOpcion(form.fuente === FUENTE.BOLSA)"
                  >
                    Una bolsa
                  </button>
                </div>
              </fieldset>
  
              @if (form.fuente === FUENTE.ITEM) {
                <ui-campo etiqueta="Premio">
                  <select
                    [(ngModel)]="form.recompensaId"
                    name="recompensaId"
                    required
                    class="campo"
                  >
                    <option value="" disabled>Elegí un premio…</option>
                    @for (p of premios(); track p.id) {
                      <option [value]="p.id">{{ p.nombre }}</option>
                    }
                  </select>
                </ui-campo>
              } @else {
                <ui-campo etiqueta="Bolsa">
                  <select
                    [(ngModel)]="form.bolsaId"
                    name="bolsaId"
                    required
                    class="campo"
                  >
                    <option value="" disabled>Elegí una bolsa…</option>
                    @for (b of bolsas(); track b.id) {
                      <option [value]="b.id">{{ b.nombre }} ({{ b.recompensaIds.length }})</option>
                    }
                  </select>
                </ui-campo>
  
                <!-- Pregunta 2: solo tiene sentido si la fuente es una bolsa. -->
                <fieldset>
                  <legend class="etiqueta-campo">¿Cómo se obtiene?</legend>
                  <div class="mt-1.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      (click)="form.mecanica = MECANICA.AZAR"
                      [class]="claseOpcion(form.mecanica === MECANICA.AZAR)"
                    >
                      Sale una al azar
                    </button>
                    <button
                      type="button"
                      (click)="form.mecanica = MECANICA.ELECCION"
                      [class]="claseOpcion(form.mecanica === MECANICA.ELECCION)"
                    >
                      La elige
                    </button>
                  </div>
                </fieldset>
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
      titulo="Archivar el producto"
      [mensaje]="
        'Se archiva «' +
        (aArchivar()?.nombre ?? '') +
        '» y deja de estar a la venta en la tienda. No se puede desarchivar. Lo ya comprado no se toca.'
      "
      textoConfirmar="Archivar"
      (confirmar)="confirmarArchivar()"
      (cancelar)="aArchivar.set(null)"
    />

    <!--
      fase-14-26: publicar de a montón. La previsualización se calcula acá con
      lo que la pantalla YA tiene cargado (catálogo + productos activos), sin
      endpoint de simulación: el Tutor ve qué se va a crear y qué se saltea
      ANTES de confirmar, mismo criterio que el atajo de bolsas.
    -->
    <ui-modal
      [abierto]="lotesAbierto()"
      titulo="Publicar desde una etiqueta"
      (cerrar)="lotesAbierto.set(false)"
    >
      @if (lotesAbierto()) {
        <form (submit)="publicarLote($event)">
          <div class="mt-4 space-y-3">
            <fieldset>
              <legend class="etiqueta-campo">Etiqueta</legend>
              <div class="mt-1.5 flex flex-wrap gap-1.5">
                @for (e of etiquetas(); track e.id) {
                  <button
                    type="button"
                    (click)="etiquetaLote.set(e.id)"
                    [attr.aria-pressed]="etiquetaLote() === e.id"
                  >
                    <app-etiqueta-chip [etiqueta]="e" [activa]="etiquetaLote() === e.id" />
                  </button>
                }
              </div>
            </fieldset>

            <ui-campo etiqueta="Precio para todos">
              <input
                [(ngModel)]="precioLote"
                name="precioLote"
                type="number"
                min="1"
                required
                class="campo"
              />
            </ui-campo>

            @if (etiquetaLote()) {
              <div class="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                @if (aPublicar().length === 0) {
                  <p class="text-slate-500 dark:text-slate-400">
                    No queda ningún ítem de esa etiqueta para publicar.
                  </p>
                } @else {
                  <p class="font-semibold text-slate-700 dark:text-slate-200">
                    Se crean {{ aPublicar().length }}:
                  </p>
                  <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {{ nombresDeLote() }}
                  </p>
                }

                @if (salteadosLote().length > 0) {
                  <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Se saltean {{ salteadosLote().length }}: {{ nombresSalteados() }}
                  </p>
                }
              </div>
            }
          </div>

          <div class="botonera">
            <button type="button" (click)="lotesAbierto.set(false)" class="boton boton-neutro">
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="publicando() || aPublicar().length === 0"
              class="boton boton-primario"
            >
              {{ publicando() ? 'Publicando…' : 'Publicar' }}
            </button>
          </div>
        </form>
      }
    </ui-modal>
  `,
})
export class ProductosComponent {
  readonly grupoId = input.required<string>();

  private readonly api = inject(RewardsApiService);

  private readonly toasts = inject(ToastService);

  protected readonly FUENTE = FuenteProducto;

  protected readonly MECANICA = MecanicaProducto;

  protected readonly cargando = signal(true);

  protected readonly guardando = signal(false);

  protected readonly productos = signal<ProductoTiendaDto[]>([]);

  protected readonly premios = signal<RecompensaDto[]>([]);

  protected readonly bolsas = signal<BolsaPremiosDto[]>([]);

  protected readonly formAbierto = signal(false);

  protected readonly editando = signal<ProductoTiendaDto | null>(null);

  /** Producto sobre el que pregunta el diálogo de archivado (fase-14-23 T4·2ª). */
  protected readonly aArchivar = signal<ProductoTiendaDto | null>(null);

  // ---- Publicar de a montón desde una etiqueta (fase-14-26) ----
  protected readonly etiquetas = signal<EtiquetaCatalogoDto[]>([]);

  protected readonly lotesAbierto = signal(false);

  protected readonly publicando = signal(false);

  protected readonly etiquetaLote = signal<string | null>(null);

  protected precioLote = 10;

  /**
   * Los premios de la etiqueta que TODAVÍA no tienen producto activo de fuente
   * ITEM. Es la misma regla que aplica el backend (decisión 11) calculada acá
   * para poder mostrarla antes de confirmar; la del servidor sigue siendo la
   * que manda — esta solo evita que el Tutor apriete a ciegas.
   */
  private readonly particion = computed(() => {
    const etiquetaId = this.etiquetaLote();

    if (!etiquetaId) {
      return { aPublicar: [], salteados: [] };
    }

    return particionarParaTienda(this.premios(), this.productos(), etiquetaId);
  });

  protected readonly aPublicar = computed(() => this.particion().aPublicar);

  protected readonly salteadosLote = computed(() => this.particion().salteados);

  private readonly rendimientos = signal<RendimientoZonaDto[]>([]);

  /** Mejor rendimiento semanal configurado, para el aviso de inflación. */
  private readonly mejorRendimiento = computed(() =>
    Math.max(0, ...this.rendimientos().map((r) => r.monedas ?? 0))
  );

  protected form: FormProducto = { ...FORM_VACIO };

  constructor() {
    effect(() => this.cargar(this.grupoId()));
  }

  protected claseOpcion(activa: boolean): string {
    return activa
      ? 'rounded-xl border-2 border-marca-500 bg-marca-50 px-3 py-2.5 text-sm font-semibold text-marca-800 transition dark:border-marca-400 dark:bg-marca-500/10 dark:text-marca-200'
      : 'rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800';
  }

  protected descripcionDe(producto: ProductoTiendaDto): string {
    if (producto.fuente === FuenteProducto.ITEM) {
      const premio = this.premios().find((p) => p.id === producto.recompensaId);

      return premio?.nombre ?? 'Premio puntual';
    }

    const bolsa = this.bolsas().find((b) => b.id === producto.bolsaId);
    const comoSeObtiene =
      producto.mecanica === MecanicaProducto.AZAR ? 'sale una al azar' : 'la elige';

    return `${bolsa?.nombre ?? 'Bolsa'} — ${comoSeObtiene}`;
  }

  /**
   * Aviso de inflación pasiva. No bloquea nada: solo hace visible lo único que
   * el sistema no puede decidir por el Tutor.
   */
  protected semanasPara(precio: number): string {
    const mejor = this.mejorRendimiento();

    if (!precio || mejor <= 0) {
      return '';
    }

    const semanas = Math.ceil(precio / mejor);

    return semanas <= 1 ? '≈ 1 semana en la mejor zona' : `≈ ${semanas} semanas en la mejor zona`;
  }

  protected abrirNuevo(): void {
    this.editando.set(null);
    this.form = { ...FORM_VACIO };
    this.formAbierto.set(true);
  }

  protected abrirEditar(producto: ProductoTiendaDto): void {
    this.editando.set(producto);
    this.form = {
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? '',
      precio: producto.precio,
      fuente: producto.fuente,
      mecanica: producto.mecanica,
      recompensaId: producto.recompensaId ?? '',
      bolsaId: producto.bolsaId ?? '',
    };
    this.formAbierto.set(true);
  }

  protected guardar(evento: Event): void {
    evento.preventDefault();

    if (this.form.nombre.trim().length === 0) {
      return;
    }

    const esItem = this.form.fuente === FuenteProducto.ITEM;

    this.guardando.set(true);

    const datos = {
      nombre: this.form.nombre.trim(),
      descripcion: this.form.descripcion.trim() || null,
      precio: Number(this.form.precio),
      fuente: this.form.fuente,
      mecanica: this.form.mecanica,
      recompensaId: esItem ? this.form.recompensaId : null,
      bolsaId: esItem ? null : this.form.bolsaId,
    };

    const actual = this.editando();
    const peticion = actual
      ? this.api.editarProducto(actual.id, datos)
      : this.api.crearProducto(this.grupoId(), datos);

    peticion.subscribe({
      next: () => {
        this.toasts.exito(actual ? 'Producto actualizado.' : 'Producto creado.');
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

  /**
   * fase-14-23 T4·2ª: archivar es un soft delete **sin reactivación por
   * endpoint**, y el tacho estaba a un clic sin decirlo. Ver la nota gemela en
   * `bolsas.component.ts`.
   */
  protected confirmarArchivar(): void {
    const producto = this.aArchivar();
    this.aArchivar.set(null);

    if (!producto) {
      return;
    }

    this.api.archivarProducto(producto.id).subscribe({
      next: () => {
        this.toasts.exito('Producto archivado.');
        this.cargar(this.grupoId());
      },
      error: (e) => this.toasts.error(mensajeDeError(e)),
    });
  }

  protected abrirDesdeEtiqueta(): void {
    this.etiquetaLote.set(null);
    this.precioLote = 10;
    this.lotesAbierto.set(true);
  }

  protected nombresDeLote(): string {
    return this.aPublicar()
      .map((premio) => premio.nombre)
      .join(' · ');
  }

  protected nombresSalteados(): string {
    return this.salteadosLote()
      .map((premio) => premio.nombre)
      .join(' · ');
  }

  protected publicarLote(evento: Event): void {
    evento.preventDefault();

    const etiquetaId = this.etiquetaLote();

    if (!etiquetaId || this.aPublicar().length === 0 || this.precioLote < 1) {
      return;
    }

    this.publicando.set(true);

    this.api
      .crearProductosDesdeEtiqueta(this.grupoId(), { etiquetaId, precio: this.precioLote })
      .subscribe({
        next: ({ creados, salteados }) => {
          this.toasts.exito(
            salteados.length === 0
              ? `Se publicaron ${creados.length} productos.`
              : `Se publicaron ${creados.length} · ${salteados.length} salteados.`
          );
          this.publicando.set(false);
          this.lotesAbierto.set(false);
          this.cargar(this.grupoId());
        },
        error: (e) => {
          this.publicando.set(false);
          this.toasts.error(mensajeDeError(e));
        },
      });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);

    forkJoin({
      productos: this.api.tienda(grupoId),
      items: this.api.listarRecompensas(grupoId, 'ACTIVA'),
      bolsas: this.api.listarBolsas(grupoId),
      rendimientos: this.api.rendimientos(grupoId),
      etiquetas: this.api.listarEtiquetas(grupoId, 'ACTIVA'),
    }).subscribe({
      next: ({ productos, items, bolsas, rendimientos, etiquetas }) => {
        this.productos.set(productos);
        this.premios.set(items.filter((i) => i.tipo === TipoItemCatalogo.PREMIO));
        this.bolsas.set(bolsas.filter((b) => b.estado === 'ACTIVA'));
        this.rendimientos.set(rendimientos);
        this.etiquetas.set(etiquetas);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
