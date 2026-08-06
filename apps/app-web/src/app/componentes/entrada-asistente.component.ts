import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { IaApiService } from '../core/api/ia-api.service';
import { IconoComponent } from './icono.component';

/**
 * La entrada de contexto al asistente («Pedirle ayuda a la IA»), fase-14-30
 * tanda 8.
 *
 * El patrón lo inventaron dos pantallas del #29 —Actividades y Rendimientos— y
 * esta tanda lo suma a cuatro más. Seis copias del mismo `@if` con la misma
 * consulta a `IaApiService` era la garantía de que la sexta se olvidara de
 * preguntar si la feature está prendida: **un atajo a una pantalla que no
 * funciona es peor que no tener el atajo**, y esa regla ahora vive en un solo
 * lugar en vez de repetirse en cada llamador.
 *
 * Dos variantes, que son las dos que ya existían:
 *
 * - `tarjeta`: la pantalla está vacía y esto **es** la acción principal —
 *   veinte formularios en blanco es exactamente el problema que el asistente
 *   resuelve.
 * - `enlace`: la pantalla ya tiene contenido y el asistente es una segunda
 *   opinión sobre lo que hay, no la forma de empezar.
 */
@Component({
  selector: 'app-entrada-asistente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent],
  template: `
    @if (disponible()) {
      @if (variante() === 'tarjeta') {
        <a
          [routerLink]="['/grupos', grupoId(), 'asistente']"
          [queryParams]="{ pregunta: pregunta() }"
          class="tarjeta tarjeta-accionable flex items-center gap-3"
        >
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-600 dark:bg-marca-900/40 dark:text-marca-300"
          >
            <span class="h-5 w-5"><app-icono nombre="chispa" /></span>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block font-semibold text-slate-900 dark:text-white">
              {{ titulo() }}
            </span>
            @if (detalle()) {
              <span class="block text-xs text-slate-500 dark:text-slate-400">
                {{ detalle() }}
              </span>
            }
          </span>
          <span class="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600">
            <app-icono nombre="chevron" />
          </span>
        </a>
      } @else {
        <a
          [routerLink]="['/grupos', grupoId(), 'asistente']"
          [queryParams]="{ pregunta: pregunta() }"
          class="inline-flex items-center gap-1.5 text-xs font-semibold text-marca-600 transition hover:underline dark:text-marca-300"
        >
          ✨ {{ titulo() }}
        </a>
      }
    }
  `,
})
export class EntradaAsistenteComponent {
  readonly grupoId = input.required<string>();

  /**
   * La pregunta ya armada. Viaja como query param y la pantalla del asistente
   * la manda sola: si el Tutor tuviera que apretar Enter sobre un texto que él
   * no escribió, el atajo no ahorraría nada.
   */
  readonly pregunta = input.required<string>();

  readonly titulo = input('Pedirle ayuda a la IA');

  /** Solo en la variante `tarjeta`: qué va a pasar si entra. */
  readonly detalle = input('');

  readonly variante = input<'tarjeta' | 'enlace'>('tarjeta');

  private readonly ia = inject(IaApiService);

  /**
   * `null` (todavía no se preguntó) cuenta como no disponible, igual que en el
   * menú: no mostrar el atajo es recuperable, ofrecer uno que termina en un
   * 403 no.
   */
  protected readonly disponible = computed(
    () => this.ia.configuracion()?.puedeUsarse === true
  );
}
