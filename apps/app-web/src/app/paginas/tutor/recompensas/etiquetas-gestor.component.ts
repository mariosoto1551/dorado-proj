import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import type { EtiquetaCatalogoDto } from '@dorado/shared-types';
import { CampoComponent, ModalComponent } from '@dorado/shared-ui';

import { IconoComponent } from '../../../componentes/icono.component';
import { ToastService } from '../../../componentes/toast.service';
import { mensajeDeError } from '../../../core/api/errores';
import { RewardsApiService } from '../../../core/api/rewards-api.service';
import { EtiquetaChipComponent } from './etiqueta-chip.component';

/** Paleta sugerida. El Tutor puede escribir cualquier hex en el color picker. */
const COLORES = [
  '#8B5CF6',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#64748B',
];

/**
 * Gestor de etiquetas (fase-14-26 decisión 14). Vive como **modal desde la
 * pestaña Catálogo** y no como pestaña propia: la pantalla de Recompensas ya
 * tiene seis, y el ítem #23 existe justamente porque estaban recargadas.
 *
 * Archivar acá **no pasa por `ui-confirm-dialog`**, a diferencia de productos y
 * bolsas: la regla que cerró el #23 T4 es *se confirma lo que no tiene vuelta
 * atrás*, y esto la tiene — el botón «Recuperar» está a la vista, en la misma
 * lista (decisión 6).
 */
@Component({
  selector: 'app-etiquetas-gestor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, CampoComponent, FormsModule, IconoComponent, EtiquetaChipComponent],
  template: `
    <ui-modal [abierto]="abierto()" titulo="Etiquetas" (cerrar)="cerrar.emit()">
      @if (abierto()) {
        <div class="mt-1">
          <p class="text-sm text-slate-500 dark:text-slate-400">
            Sirven para encontrar ítems y para armar bolsas o publicar productos de a montón.
            <b>Solo las ves vos</b>: no aparecen en la pantalla de los integrantes.
          </p>

          <form (submit)="guardar($event)" class="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <ui-campo [etiqueta]="editando() ? 'Renombrar' : 'Nueva etiqueta'">
              <input
                [(ngModel)]="nombre"
                name="nombre"
                required
                maxlength="40"
                placeholder="Ej: Pantalla, Salidas, Golosinas"
                class="campo"
              />
            </ui-campo>

            <div class="mt-3">
              <span class="etiqueta-campo">Color</span>
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                @for (c of COLORES; track c) {
                  <button
                    type="button"
                    (click)="color = c"
                    [attr.aria-label]="'Color ' + c"
                    [attr.aria-pressed]="color === c"
                    class="h-7 w-7 rounded-full border-2 transition"
                    [style.background-color]="c"
                    [style.border-color]="color === c ? c : 'transparent'"
                    [class]="color === c ? 'ring-2 ring-slate-400 ring-offset-2 dark:ring-offset-slate-900' : ''"
                  ></button>
                }
                <input
                  [(ngModel)]="color"
                  name="color"
                  type="color"
                  aria-label="Color personalizado"
                  class="h-7 w-10 cursor-pointer rounded border border-slate-300 bg-transparent dark:border-slate-600"
                />
              </div>
            </div>

            <div class="mt-3 flex justify-end gap-2">
              @if (editando()) {
                <button type="button" (click)="cancelarEdicion()" class="boton boton-neutro">
                  Cancelar
                </button>
              }
              <button type="submit" [disabled]="guardando()" class="boton boton-primario">
                {{ editando() ? 'Guardar cambios' : 'Crear' }}
              </button>
            </div>
          </form>

          @if (cargando()) {
            <p class="mt-6 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
          } @else {
            <ul class="mt-4 space-y-1.5">
              @for (e of etiquetas(); track e.id) {
                <li
                  class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700"
                  [class.opacity-60]="e.estado === 'ARCHIVADA'"
                >
                  <app-etiqueta-chip [etiqueta]="e" [sufijo]="e.estado === 'ARCHIVADA' ? '· archivada' : null" />

                  <div class="flex shrink-0 gap-1">
                    @if (e.estado === 'ACTIVA') {
                      <button
                        type="button"
                        (click)="abrirEditar(e)"
                        class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-marca-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-marca-300"
                        aria-label="Renombrar"
                      >
                        <span class="h-4 w-4"><app-icono nombre="pencil" /></span>
                      </button>
                      <button
                        type="button"
                        (click)="archivar(e)"
                        class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                        aria-label="Archivar"
                      >
                        <span class="h-4 w-4"><app-icono nombre="trash" /></span>
                      </button>
                    } @else {
                      <button
                        type="button"
                        (click)="desarchivar(e)"
                        class="rounded-lg px-2.5 py-1 text-xs font-semibold text-marca-600 transition hover:bg-marca-50 dark:text-marca-300 dark:hover:bg-marca-500/10"
                      >
                        Recuperar
                      </button>
                    }
                  </div>
                </li>
              } @empty {
                <li class="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                  Todavía no creaste ninguna etiqueta.
                </li>
              }
            </ul>
          }
        </div>

        <div class="botonera">
          <button type="button" (click)="cerrar.emit()" class="boton boton-neutro">Listo</button>
        </div>
      }
    </ui-modal>
  `,
})
export class EtiquetasGestorComponent {
  readonly grupoId = input.required<string>();

  readonly abierto = input.required<boolean>();

  readonly cerrar = output<void>();

  /** Toda escritura avisa: la pantalla de atrás tiene que recargar sus chips. */
  readonly cambio = output<void>();

  protected readonly COLORES = COLORES;

  private readonly api = inject(RewardsApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(false);

  protected readonly guardando = signal(false);

  /** Activas Y archivadas: recuperar una archivada se hace desde acá mismo. */
  protected readonly etiquetas = signal<EtiquetaCatalogoDto[]>([]);

  protected readonly editando = signal<EtiquetaCatalogoDto | null>(null);

  protected nombre = '';

  protected color = COLORES[0];

  constructor() {
    // Recarga cada vez que se abre: mientras estuvo cerrado pudo cambiar el
    // catálogo desde otra pestaña de la misma pantalla.
    effect(() => {
      if (this.abierto()) {
        this.cargar();
      }
    });
  }

  private cargar(): void {
    this.cargando.set(true);
    this.cancelarEdicion();

    // Las dos listas juntas: la archivada se ve acá porque «Recuperar» vive en
    // esta misma fila, y sin traerla no habría desde dónde recuperarla.
    forkJoin({
      activas: this.api.listarEtiquetas(this.grupoId(), 'ACTIVA'),
      archivadas: this.api.listarEtiquetas(this.grupoId(), 'ARCHIVADA'),
    }).subscribe({
      next: ({ activas, archivadas }) => {
        this.etiquetas.set([...activas, ...archivadas]);
        this.cargando.set(false);
      },
      error: (e) => {
        this.cargando.set(false);
        this.toasts.error(mensajeDeError(e));
      },
    });
  }

  protected abrirEditar(etiqueta: EtiquetaCatalogoDto): void {
    this.editando.set(etiqueta);
    this.nombre = etiqueta.nombre;
    this.color = etiqueta.colorHex;
  }

  protected cancelarEdicion(): void {
    this.editando.set(null);
    this.nombre = '';
    this.color = COLORES[0];
  }

  protected guardar(evento: Event): void {
    evento.preventDefault();

    if (this.nombre.trim().length === 0) {
      return;
    }

    this.guardando.set(true);

    const datos = { nombre: this.nombre.trim(), colorHex: this.color };
    const actual = this.editando();
    const peticion = actual
      ? this.api.editarEtiqueta(actual.id, datos)
      : this.api.crearEtiqueta(this.grupoId(), datos);

    peticion.subscribe({
      next: () => {
        this.toasts.exito(actual ? 'Etiqueta actualizada.' : 'Etiqueta creada.');
        this.guardando.set(false);
        this.cancelarEdicion();
        this.cargar();
        this.cambio.emit();
      },
      error: (e) => {
        this.guardando.set(false);
        this.toasts.error(mensajeDeError(e));
      },
    });
  }

  /** Sin diálogo de confirmación: tiene «Recuperar» al lado (decisión 6). */
  protected archivar(etiqueta: EtiquetaCatalogoDto): void {
    this.api.archivarEtiqueta(etiqueta.id).subscribe({
      next: () => {
        this.toasts.exito('Etiqueta archivada. La podés recuperar acá mismo.');
        this.cargar();
        this.cambio.emit();
      },
      error: (e) => this.toasts.error(mensajeDeError(e)),
    });
  }

  protected desarchivar(etiqueta: EtiquetaCatalogoDto): void {
    this.api.desarchivarEtiqueta(etiqueta.id).subscribe({
      next: () => {
        this.toasts.exito('Etiqueta recuperada con sus ítems.');
        this.cargar();
        this.cambio.emit();
      },
      error: (e) => this.toasts.error(mensajeDeError(e)),
    });
  }
}
