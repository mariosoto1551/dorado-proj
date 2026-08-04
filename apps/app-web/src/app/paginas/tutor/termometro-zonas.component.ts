import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { UmbralZonaDto } from '@dorado/shared-types';

import {
  construirEscala,
  type MarcaTermometro,
  type ParticipanteTermometro,
  type TramoTermometro,
} from '../../core/termometro';

/** Alto de una etiqueta de participante, en px. Fija la separación mínima. */
const ALTO_ETIQUETA_PX = 26;

/** El tubo crece con la cantidad de gente, entre estos dos límites. */
const ALTO_MINIMO_PX = 300;

const ALTO_MAXIMO_PX = 520;

const ALTO_POR_PARTICIPANTE_PX = 40;

/**
 * Termómetro de zonas del home del grupo.
 *
 * Presentacional puro: recibe umbrales y puntajes ya cargados. La geometría
 * vive en `core/termometro.ts` y se testea sola.
 *
 * Tres decisiones que conviene no revertir sin pensarlas:
 *
 *  1. **Nada depende de hover.** Los nombres de todos los participantes están
 *     siempre escritos. Cuando dos puntajes caen encima, las etiquetas se
 *     separan y una línea guía apunta al punto real. Es mobile-first: en un
 *     teléfono el hover no existe, y ésta es la pantalla que se mira en el
 *     teléfono.
 *  2. **Escala lineal en puntos**, no bandas de igual alto. Verde mide 25
 *     puntos y Rojo 10, así que Verde se dibuja más alto: si se igualaran, la
 *     posición de una marca dejaría de significar su puntaje.
 *  3. **El mercurio es el promedio del grupo**, no un participante. Un
 *     termómetro muestra UNA temperatura; acá esa temperatura es "cómo viene el
 *     grupo", y las personas son las marcas sobre la escala.
 */
@Component({
  selector: 'app-termometro-zonas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (escala().tramos.length === 0) {
      <p class="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
        Definí las zonas del grupo para ver el termómetro.
      </p>
    } @else {
      <div class="pt-4 pb-12">
        <div class="flex items-stretch gap-1.5" [style.height.px]="alto()">
          <!-- ===== Nombres de zona ===== -->
          <div class="relative w-14 shrink-0" aria-hidden="true">
            @for (t of escala().tramos; track t.id) {
              @if (t.hasta - t.desde >= 11) {
                <span
                  class="absolute right-1 translate-y-1/2 text-right text-[10px] leading-tight font-bold tracking-wide uppercase"
                  [style.bottom.%]="centro(t)"
                  [style.color]="t.colorHex"
                >
                  {{ t.nombre }}
                </span>
              }
            }
          </div>

          <!-- ===== Tubo + bulbo ===== -->
          <div class="relative w-9 shrink-0">
            <!-- Flecha de "la zona más alta no tiene techo" -->
            @if (zonaAbierta(); as abierta) {
              <span
                class="absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs leading-none"
                [style.color]="abierta.colorHex"
                [attr.aria-label]="'La zona ' + abierta.nombre + ' no tiene tope'"
                >▲</span
              >
            }

            <div
              class="absolute inset-y-0 left-1/2 w-7 -translate-x-1/2 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200 ring-inset dark:bg-slate-800 dark:ring-slate-700"
              aria-hidden="true"
            >
              @for (t of escala().tramos; track t.id) {
                <div
                  class="absolute inset-x-0 opacity-30 dark:opacity-40"
                  [style.bottom.%]="t.desde"
                  [style.height.%]="t.hasta - t.desde"
                  [style.background-color]="t.colorHex"
                ></div>
                <!-- Marca de nivel entre zonas -->
                @if (t.desde > 0) {
                  <div
                    class="absolute inset-x-0 h-px bg-white/70 dark:bg-slate-950/50"
                    [style.bottom.%]="t.desde"
                  ></div>
                }
              }

              <!-- Mercurio: el promedio del grupo -->
              @if (escala().promedio !== null) {
                <div
                  class="absolute inset-x-1.5 bottom-0 rounded-t-full transition-all duration-1000 ease-out"
                  [style.height.%]="escala().posicionPromedio"
                  [style.background-color]="escala().colorPromedio"
                ></div>
              }
            </div>

            <!-- Bulbo -->
            <div
              class="absolute -bottom-4 left-1/2 h-9 w-9 -translate-x-1/2 rounded-full ring-1 ring-slate-200 transition-colors duration-1000 dark:ring-slate-700"
              [style.background-color]="escala().colorPromedio"
              aria-hidden="true"
            ></div>

            <!-- Marcas de cada participante -->
            @for (m of escala().marcas; track m.usuarioId) {
              <span
                class="absolute left-1/2 z-10 h-3 w-3 translate-y-1/2 -translate-x-1/2 rotate-45 rounded-[3px] border-2 border-white shadow-sm transition-all duration-700 ease-out dark:border-slate-900"
                [style.bottom.%]="m.posicion"
                [style.background-color]="m.colorHex"
                [class.opacity-40]="m.descalificado"
                aria-hidden="true"
              ></span>
            }
          </div>

          <!-- ===== Líneas guía ===== -->
          <div class="relative w-6 shrink-0">
            <svg
              class="absolute inset-0 h-full w-full overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              @for (m of escala().marcas; track m.usuarioId) {
                <line
                  x1="0"
                  x2="100"
                  [attr.y1]="100 - m.posicion"
                  [attr.y2]="100 - m.posicionEtiqueta"
                  [attr.stroke]="m.colorHex"
                  [attr.opacity]="m.descalificado ? 0.25 : 0.5"
                  stroke-width="1"
                  vector-effect="non-scaling-stroke"
                />
              }
            </svg>
          </div>

          <!-- ===== Etiquetas ===== -->
          <ul class="relative min-w-0 flex-1">
            @for (m of escala().marcas; track m.usuarioId) {
              <li
                class="absolute inset-x-0 flex translate-y-1/2 items-center gap-1.5 transition-all duration-700 ease-out"
                [style.bottom.%]="m.posicionEtiqueta"
                [class.opacity-50]="m.descalificado"
              >
                <span
                  class="h-1.5 w-1.5 shrink-0 rounded-full"
                  [style.background-color]="m.colorHex"
                  aria-hidden="true"
                ></span>
                <span
                  class="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-100"
                >
                  {{ m.nombre }}
                  @if (m.descalificado) {
                    <span class="sr-only">(descalificado)</span>
                  }
                </span>
                @if (m.fueraDeEscala) {
                  <span
                    class="shrink-0 text-[10px] text-slate-400 dark:text-slate-500"
                    [title]="tituloFueraDeEscala(m)"
                  >
                    {{ m.fueraDeEscala === 'ARRIBA' ? '↑' : '↓' }}
                  </span>
                }
                <span
                  class="shrink-0 text-xs font-bold tabular-nums text-slate-900 dark:text-white"
                >
                  {{ m.puntaje }}
                </span>
              </li>
            }
          </ul>
        </div>
      </div>

      <!-- ===== Pie ===== -->
      @if (escala().promedio !== null) {
        <p class="text-center text-xs text-slate-500 dark:text-slate-400">
          Promedio del grupo:
          <span class="font-bold text-slate-900 dark:text-white">{{ escala().promedio }}</span>
          @if (escala().zonaPromedio; as z) {
            · <span class="font-semibold" [style.color]="z.colorHex">{{ z.nombre }}</span>
          }
        </p>
      } @else {
        <p class="text-center text-xs text-slate-400 dark:text-slate-500">
          Todavía no hay puntajes para mostrar.
        </p>
      }
    }
  `,
})
export class TermometroZonasComponent {
  readonly umbrales = input.required<UmbralZonaDto[]>();

  readonly participantes = input.required<ParticipanteTermometro[]>();

  /**
   * El tubo crece con la cantidad de gente: con 12 participantes un alto fijo
   * dejaría las etiquetas encimadas aunque el algoritmo las separe.
   */
  protected readonly alto = computed(() =>
    Math.min(
      ALTO_MAXIMO_PX,
      Math.max(
        ALTO_MINIMO_PX,
        ALTO_ETIQUETA_PX + ALTO_POR_PARTICIPANTE_PX * this.participantes().length
      )
    )
  );

  protected readonly escala = computed(() =>
    construirEscala(this.umbrales(), this.participantes(), {
      separacionMinima: (ALTO_ETIQUETA_PX / this.alto()) * 100,
    })
  );

  protected readonly zonaAbierta = computed(
    () => this.escala().tramos.find((t) => t.abierta) ?? null
  );

  protected centro(tramo: TramoTermometro): number {
    return (tramo.desde + tramo.hasta) / 2;
  }

  protected tituloFueraDeEscala(marca: MarcaTermometro): string {
    return marca.fueraDeEscala === 'ARRIBA'
      ? `${marca.puntaje} puntos: se pasó del tope del termómetro`
      : `${marca.puntaje} puntos: está por debajo de la zona más baja`;
  }
}
