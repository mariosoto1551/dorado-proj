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

import {
  TipoItemCatalogo,
  type BolsaPremiosDto,
  type EtiquetaCatalogoDto,
  type RecompensaDto,
} from '@dorado/shared-types';

import { IconoComponent } from '../../../componentes/icono.component';
import { ToastService } from '../../../componentes/toast.service';
import { mensajeDeError } from '../../../core/api/errores';
import { RewardsApiService } from '../../../core/api/rewards-api.service';
import { premiosParaBolsa } from '../../../core/etiquetas-catalogo';
import {
  ConfirmDialogComponent,
  EstadoVacioComponent,
  CampoComponent,
  ModalComponent,
} from '@dorado/shared-ui';
import { EtiquetaChipComponent } from './etiqueta-chip.component';

/**
 * Bolsas de premios (fase-14-22 decisiones 19 y 20). Son SIEMPRE de premios:
 * los castigos ni aparecen acá. El atajo «agregar todos» precarga la lista y
 * la deja editable — explícita antes de guardar, mismo criterio que la
 * secuencia de turnos del #21.
 */
@Component({
  selector: 'app-bolsas',
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
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Conjuntos de premios para los productos «sorpresa» o «elegí vos».
      </p>
      <button
        type="button"
        (click)="abrirNueva()"
        [disabled]="premios().length === 0"
        class="boton boton-primario"
      >
        <span class="h-4 w-4"><app-icono nombre="plus" /></span>
        Nueva bolsa
      </button>
    </div>

    @if (premios().length === 0 && !cargando()) {
      <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
        Primero cargá algunos premios en la pestaña «Catálogo».
      </p>
    }

    @if (cargando()) {
      <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
    } @else if (bolsas().length === 0) {
      <ui-estado-vacio class="mt-5">
        Todavía no hay bolsas.
      </ui-estado-vacio>
    } @else {
      <ul class="mt-5 grid gap-3 sm:grid-cols-2">
        @for (b of bolsas(); track b.id) {
          <li class="tarjeta">
            <div class="flex items-start justify-between gap-2">
              <p class="font-semibold text-slate-900 dark:text-white">{{ b.nombre }}</p>
              <span class="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {{ b.recompensaIds.length }} premios
              </span>
            </div>
            <p class="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
              {{ nombresDe(b) }}
            </p>
            <div class="mt-3 flex justify-end gap-1 border-t border-slate-50 pt-2 dark:border-slate-800">
              <button
                type="button"
                (click)="abrirEditar(b)"
                class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-marca-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-marca-300"
                aria-label="Editar"
              >
                <span class="h-4 w-4"><app-icono nombre="pencil" /></span>
              </button>
              <button
                type="button"
                (click)="aArchivar.set(b)"
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
      [titulo]="editando() ? 'Editar bolsa' : 'Nueva bolsa'"
      (cerrar)="formAbierto.set(false)"
    >
      @if (formAbierto()) {
        <form (submit)="guardar($event)" class="flex flex-col">
  
            <ui-campo etiqueta="Nombre" class="mt-4">
              <input
                [(ngModel)]="nombre"
                name="nombre"
                required
                maxlength="120"
                placeholder="Ej: Sorpresas chicas"
                class="campo"
              />
            </ui-campo>
  
            <div class="mt-4 flex items-center justify-between">
              <span class="etiqueta-campo">
                Premios ({{ elegidos().length }})
              </span>
              <button
                type="button"
                (click)="agregarTodos()"
                class="text-xs font-semibold text-marca-600 hover:underline dark:text-marca-300"
              >
                Agregar todos
              </button>
            </div>

            <!--
              fase-14-26: el atajo por etiqueta. PRECARGA la selección y la deja
              editable — lo que se guarda sigue siendo la lista explícita de
              ítems (decisión 19 del #22, intacta): un premio que se etiquete
              mañana NO entra solo a esta bolsa.
            -->
            @if (etiquetas().length > 0) {
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <span class="text-xs text-slate-500 dark:text-slate-400">Agregar los de:</span>
                @for (e of etiquetas(); track e.id) {
                  <button type="button" (click)="agregarDeEtiqueta(e.id)">
                    <app-etiqueta-chip [etiqueta]="e" />
                  </button>
                }
              </div>
              @if (avisoEtiqueta()) {
                <p class="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {{ avisoEtiqueta() }}
                </p>
              }
            }

            <ul class="mt-2 flex-1 space-y-1.5 overflow-y-auto">
              @for (p of premios(); track p.id) {
                <li>
                  <label class="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 p-2.5 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      [checked]="elegidos().includes(p.id)"
                      (change)="alternar(p.id)"
                      class="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500 dark:border-slate-600"
                    />
                    <span class="text-sm text-slate-700 dark:text-slate-200">{{ p.nombre }}</span>
                  </label>
                </li>
              }
            </ul>
  
          <div class="botonera">
            <button type="button" (click)="formAbierto.set(false)" class="boton boton-neutro">
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="guardando() || elegidos().length === 0"
              class="boton boton-primario"
            >
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      }
    </ui-modal>

    <ui-confirm-dialog
      [abierto]="aArchivar() !== null"
      titulo="Archivar la bolsa"
      [mensaje]="
        'Se archiva «' +
        (aArchivar()?.nombre ?? '') +
        '» y deja de estar disponible para los productos que la usan. No se puede desarchivar.'
      "
      textoConfirmar="Archivar"
      (confirmar)="confirmarArchivar()"
      (cancelar)="aArchivar.set(null)"
    />
  `,
})
export class BolsasComponent {
  readonly grupoId = input.required<string>();

  private readonly api = inject(RewardsApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly guardando = signal(false);

  protected readonly bolsas = signal<BolsaPremiosDto[]>([]);

  /** Solo PREMIO: una bolsa nunca puede contener castigos (decisión 20). */
  protected readonly premios = signal<RecompensaDto[]>([]);

  protected readonly formAbierto = signal(false);

  protected readonly editando = signal<BolsaPremiosDto | null>(null);

  /** Bolsa sobre la que pregunta el diálogo de archivado (fase-14-23 T4·2ª). */
  protected readonly aArchivar = signal<BolsaPremiosDto | null>(null);

  protected readonly elegidos = signal<string[]>([]);

  /** fase-14-26: etiquetas activas del grupo, para el atajo de precarga. */
  protected readonly etiquetas = signal<EtiquetaCatalogoDto[]>([]);

  /** Resultado del último atajo: cuántos entraron y cuántos se saltearon. */
  protected readonly avisoEtiqueta = signal<string | null>(null);

  /** Ítems del catálogo COMPLETO, para saber qué castigos lleva una etiqueta. */
  private readonly todos = signal<RecompensaDto[]>([]);

  protected nombre = '';

  constructor() {
    effect(() => this.cargar(this.grupoId()));
  }

  /**
   * Precarga los premios de una etiqueta. Los castigos se **saltean en
   * silencio** y se cuentan en el aviso: mandarlos sería un 400
   * `CASTIGO_NO_VA_EN_BOLSA` del backend, y una bolsa nunca los lleva.
   */
  protected agregarDeEtiqueta(etiquetaId: string): void {
    const { premios, castigosSalteados } = premiosParaBolsa(this.todos(), etiquetaId);

    this.elegidos.update((actual) => [
      ...actual,
      ...premios.map((premio) => premio.id).filter((id) => !actual.includes(id)),
    ]);

    this.avisoEtiqueta.set(
      castigosSalteados === 0
        ? `Se agregaron ${premios.length} premios.`
        : `Se agregaron ${premios.length} premios · ${castigosSalteados} castigos no van en bolsa.`
    );
  }

  protected nombresDe(bolsa: BolsaPremiosDto): string {
    const porId = new Map(this.premios().map((p) => [p.id, p.nombre]));

    return bolsa.recompensaIds.map((id) => porId.get(id) ?? '—').join(' · ');
  }

  protected abrirNueva(): void {
    this.editando.set(null);
    this.nombre = '';
    this.elegidos.set([]);
    this.avisoEtiqueta.set(null);
    this.formAbierto.set(true);
  }

  protected abrirEditar(bolsa: BolsaPremiosDto): void {
    this.editando.set(bolsa);
    this.nombre = bolsa.nombre;
    this.elegidos.set([...bolsa.recompensaIds]);
    this.avisoEtiqueta.set(null);
    this.formAbierto.set(true);
  }

  protected alternar(id: string): void {
    this.elegidos.update((actual) =>
      actual.includes(id) ? actual.filter((otro) => otro !== id) : [...actual, id]
    );
  }

  protected agregarTodos(): void {
    this.elegidos.set(this.premios().map((p) => p.id));
  }

  protected guardar(evento: Event): void {
    evento.preventDefault();

    if (this.nombre.trim().length === 0 || this.elegidos().length === 0) {
      return;
    }

    this.guardando.set(true);

    const datos = { nombre: this.nombre.trim(), recompensaIds: this.elegidos() };
    const actual = this.editando();
    const peticion = actual
      ? this.api.editarBolsa(actual.id, datos)
      : this.api.crearBolsa(this.grupoId(), datos);

    peticion.subscribe({
      next: () => {
        this.toasts.exito(actual ? 'Bolsa actualizada.' : 'Bolsa creada.');
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
   * endpoint** —lo dice el servicio del backend— y la pantalla no lo decía en
   * ningún lado, con el tacho a un clic. Por la regla de la vuelta («se
   * confirma lo que no tiene vuelta atrás»), pasa por el diálogo.
   */
  protected confirmarArchivar(): void {
    const bolsa = this.aArchivar();
    this.aArchivar.set(null);

    if (!bolsa) {
      return;
    }

    this.api.archivarBolsa(bolsa.id).subscribe({
      next: () => {
        this.toasts.exito('Bolsa archivada.');
        this.cargar(this.grupoId());
      },
      error: (e) => this.toasts.error(mensajeDeError(e)),
    });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);

    forkJoin({
      bolsas: this.api.listarBolsas(grupoId),
      items: this.api.listarRecompensas(grupoId, 'ACTIVA'),
      etiquetas: this.api.listarEtiquetas(grupoId, 'ACTIVA'),
    }).subscribe({
      next: ({ bolsas, items, etiquetas }) => {
        this.bolsas.set(bolsas.filter((b) => b.estado === 'ACTIVA'));
        this.todos.set(items);
        this.premios.set(items.filter((i) => i.tipo === TipoItemCatalogo.PREMIO));
        this.etiquetas.set(etiquetas);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
