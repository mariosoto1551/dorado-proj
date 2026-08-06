import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import type { PropuestaIaDto, ResultadoOperacionIa } from '@dorado/shared-types';
import { ConfirmDialogComponent } from '@dorado/shared-ui';

import { IconoComponent } from '../../../componentes/icono.component';
import {
  armarFilas,
  estaCerrada,
  horasHastaVencer,
  type ContextoPropuesta,
} from '../../../core/propuesta-ia';

const TITULOS: Record<PropuestaIaDto['tipo'], string> = {
  CREAR_ACTIVIDADES: 'Actividades nuevas',
  EDITAR_ACTIVIDADES: 'Cambios al catálogo',
  PRECIOS_TIENDA: 'Precios de la tienda',
  RENDIMIENTOS_MONEDAS: 'Lo que paga cada acción',
  // fase-14-30 tanda 4 — familia catálogo.
  CREAR_CONDUCTAS: 'Conductas nuevas',
  EDITAR_CONDUCTAS: 'Cambios a las conductas',
  TURNOS: 'Rotación de turnos',
  // fase-14-30 tanda 5 — familia economía.
  CREAR_RECOMPENSAS: 'Premios y castigos nuevos',
  EDITAR_RECOMPENSAS: 'Cambios al catálogo de premios',
  PRODUCTOS_TIENDA: 'Productos nuevos en la tienda',
  ETIQUETAS: 'Etiquetas del catálogo',
};

const ESTADOS: Record<PropuestaIaDto['estado'], string> = {
  BORRADOR: '',
  APLICADA: 'Aplicada',
  APLICADA_PARCIAL: 'Aplicada en parte',
  DESCARTADA: 'Descartada',
  VENCIDA: 'Vencida',
};

/**
 * La tarjeta de propuesta embebida en la conversación (fase-14-29 Parte F).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA TARJETA ES EL CONTROL HUMANO DE TODO EL ÍTEM.
 *
 * La decisión 2 —«la IA propone, el humano aplica»— vale exactamente lo que
 * valga lo que se lee acá: si el Tutor no entiende qué va a pasar, aprobar es
 * un botón y no una revisión. Por eso **nada de JSON crudo**, el valor viejo al
 * lado del nuevo en cada edición, y el aviso de vencimiento a la vista.
 *
 * Y por eso también **se confirma «Aplicar» y no «Descartar»** (regla del
 * #23 T4: se confirma lo que no tiene vuelta atrás). Descartar no borra nada
 * que exista en el grupo — la propuesta nunca tocó una base.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Component({
  selector: 'app-tarjeta-propuesta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, ConfirmDialogComponent],
  template: `
    <article class="tarjeta animate-slide-up border-marca-200 dark:border-marca-800">
      <header class="flex flex-wrap items-center gap-2">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-600 dark:bg-marca-900/40 dark:text-marca-300"
        >
          <span class="h-4 w-4"><app-icono nombre="chispa" /></span>
        </span>
        <h3 class="min-w-0 flex-1 font-semibold text-slate-900 dark:text-white">
          {{ titulo() }}
          <span class="font-normal text-slate-400 dark:text-slate-500">
            · {{ filas().length }}
            {{ filas().length === 1 ? 'cambio' : 'cambios' }}
          </span>
        </h3>

        @if (etiquetaEstado()) {
          <span
            class="rounded-full px-2.5 py-1 text-xs font-semibold"
            [class]="tonoEstado()"
          >{{ etiquetaEstado() }}</span>
        }
      </header>

      <ul class="mt-3 space-y-2">
        @for (fila of filas(); track fila.opId) {
          <li
            class="rounded-xl border p-3 transition"
            [class]="tonoFila(fila.opId)"
          >
            <div class="flex items-start gap-2.5">
              @if (editable()) {
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-marca-600 focus:ring-marca-400 dark:border-slate-600"
                  [checked]="elegidas().has(fila.opId)"
                  (change)="alternar(fila.opId)"
                  [attr.aria-label]="fila.titulo"
                />
              }
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-slate-900 dark:text-white">
                  {{ fila.titulo }}
                </p>

                @if (fila.cambios.length > 0) {
                  <dl class="mt-1.5 grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
                    @for (cambio of fila.cambios; track cambio.campo) {
                      <dt class="text-slate-400 dark:text-slate-500">{{ cambio.campo }}</dt>
                      <dd class="text-slate-700 dark:text-slate-200">
                        @if (cambio.antes !== null) {
                          <span class="text-slate-400 line-through dark:text-slate-600">{{
                            cambio.antes
                          }}</span>
                          <span class="mx-1 text-slate-300 dark:text-slate-600">→</span>
                        }
                        <span class="font-medium">{{ cambio.despues }}</span>
                      </dd>
                    }
                  </dl>
                }

                @if (resultadoDe(fila.opId); as fin) {
                  <p
                    class="mt-2 text-xs font-semibold"
                    [class]="fin.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'"
                  >
                    {{ fin.ok ? '✓ Listo' : '✗ ' + (fin.error ?? 'No se pudo aplicar') }}
                  </p>
                } @else if (enCurso() === fila.opId) {
                  <p class="mt-2 animate-pulse text-xs font-semibold text-marca-600 dark:text-marca-300">
                    Aplicando…
                  </p>
                }
              </div>
            </div>
          </li>
        }
      </ul>

      @if (editable()) {
        <p class="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Nada de esto está aplicado todavía.
          @if (horasRestantes() > 0) {
            La propuesta vence en {{ horasRestantes() }} h.
          } @else {
            La propuesta vence en menos de una hora.
          }
        </p>

        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="boton boton-primario boton-sm"
            [disabled]="aplicando()"
            (click)="pedirConfirmacion(false)"
          >
            Aplicar todo
          </button>
          <button
            type="button"
            class="boton boton-neutro boton-sm"
            [disabled]="aplicando() || elegidas().size === 0"
            (click)="pedirConfirmacion(true)"
          >
            Aplicar {{ elegidas().size }} seleccionada{{ elegidas().size === 1 ? '' : 's' }}
          </button>
          <button
            type="button"
            class="boton boton-peligro boton-sm"
            [disabled]="aplicando()"
            (click)="descartar.emit()"
          >
            Descartar
          </button>
        </div>
      } @else if (propuesta().estado === 'VENCIDA') {
        <p class="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Pasaron más de 24 h desde que se armó y el grupo pudo cambiar. Pedile
          al asistente que la rehaga con el estado de ahora.
        </p>
      }
    </article>

    <!-- Se confirma lo que no tiene vuelta atrás. Descartar no entra acá. -->
    <ui-confirm-dialog
      [abierto]="porConfirmar() !== null"
      titulo="Aplicar los cambios"
      [mensaje]="mensajeConfirmacion()"
      textoConfirmar="Aplicar"
      tono="primario"
      (confirmar)="confirmar()"
      (cancelar)="porConfirmar.set(null)"
    />
  `,
})
export class TarjetaPropuestaComponent {
  readonly propuesta = input.required<PropuestaIaDto>();

  readonly contexto = input<ContextoPropuesta>({});

  /** La operación que se está ejecutando ahora mismo, para el «Aplicando…». */
  readonly enCurso = input<string | null>(null);

  readonly aplicando = input(false);

  /**
   * Resultado por fila **mientras se aplica**: llega parcial, fila a fila.
   *
   * Vacío es lo normal —una propuesta que no se está aplicando ahora— y por eso
   * el resultado ya guardado sale de `propuesta().resultado` (ver `filaFinal`):
   * si dependiera solo de este input, reabrir una conversación vieja mostraría
   * la propuesta sin ninguna de sus filas rojas, o sea diciendo que salió todo
   * bien cuando no.
   */
  readonly resultados = input<readonly ResultadoOperacionIa[]>([]);

  /** `undefined` = todas. Lista de `opId` = solo esas. */
  readonly aplicar = output<string[] | undefined>();

  readonly descartar = output<void>();

  /**
   * Qué está esperando confirmación. `null` = el diálogo está cerrado;
   * `{ opIds: undefined }` = «Aplicar todo»; con lista = solo esas.
   *
   * Se envuelve en un objeto y no se usa `undefined` como tercer estado: dos
   * valores vacíos distintos en el mismo signal son la clase de cosa que se
   * lee mal seis meses después.
   */
  protected readonly porConfirmar = signal<{ opIds?: string[] } | null>(null);

  /**
   * Arranca con todo tildado: el caso dominante es «esto está bien, dale», y
   * obligar a tildar cinco casillas para eso sería fricción sin criterio. Lo
   * que la selección permite es lo contrario —sacar una que no convence— y eso
   * se hace destildando.
   */
  private readonly destildadas = signal<ReadonlySet<string>>(new Set());

  protected readonly filas = computed(() => armarFilas(this.propuesta(), this.contexto()));

  protected readonly elegidas = computed(() => {
    const fuera = this.destildadas();

    return new Set(this.filas().map((fila) => fila.opId).filter((opId) => !fuera.has(opId)));
  });

  protected readonly titulo = computed(() => TITULOS[this.propuesta().tipo]);

  protected readonly etiquetaEstado = computed(() => ESTADOS[this.propuesta().estado]);

  protected readonly editable = computed(() => !estaCerrada(this.propuesta()));

  protected readonly horasRestantes = computed(() => horasHastaVencer(this.propuesta()));

  protected readonly mensajeConfirmacion = computed(() => {
    const cuantas = this.porConfirmar()?.opIds?.length ?? this.filas().length;

    return (
      `Se van a aplicar ${cuantas} ${cuantas === 1 ? 'cambio' : 'cambios'} sobre el grupo, ` +
      'igual que si los hubieras cargado a mano. Esto sí se escribe.'
    );
  });

  protected readonly tonoEstado = computed(() => {
    switch (this.propuesta().estado) {
      case 'APLICADA':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';

      case 'APLICADA_PARCIAL':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';

      default:
        return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
    }
  });

  protected alternar(opId: string): void {
    this.destildadas.update((fuera) => {
      const siguiente = new Set(fuera);

      if (siguiente.has(opId)) {
        siguiente.delete(opId);
      } else {
        siguiente.add(opId);
      }

      return siguiente;
    });
  }

  /**
   * El resultado de una fila: el del aplicado en curso si lo hay, y si no el
   * que quedó guardado en la propuesta. En ese orden y no al revés — mientras
   * se aplica, lo que importa es lo que está pasando ahora.
   */
  protected resultadoDe(opId: string): ResultadoOperacionIa | undefined {
    const enVivo = this.resultados();
    const fuente = enVivo.length > 0 ? enVivo : (this.propuesta().resultado ?? []);

    return fuente.find((resultado) => resultado.opId === opId);
  }

  protected pedirConfirmacion(soloSeleccionadas: boolean): void {
    this.porConfirmar.set(soloSeleccionadas ? { opIds: [...this.elegidas()] } : {});
  }

  protected confirmar(): void {
    const pendiente = this.porConfirmar();

    this.porConfirmar.set(null);
    this.aplicar.emit(pendiente?.opIds);
  }

  protected tonoFila(opId: string): string {
    const resultado = this.resultadoDe(opId);

    if (!resultado) {
      return 'border-slate-200 dark:border-slate-800';
    }

    return resultado.ok
      ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-500/5'
      : 'border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-500/5';
  }
}
