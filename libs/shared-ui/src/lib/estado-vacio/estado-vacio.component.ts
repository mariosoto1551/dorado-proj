import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Recuadro punteado de "todavía no hay nada acá" (fase-14-23 T2).
 *
 * Reemplaza los 30 recuadros escritos a mano en 25 archivos. Las 12 variantes
 * que había diferían casi solo en el margen superior (`mt-6`/`mt-5`/`mt-4`),
 * que ahora lo pone la página con una utilidad si lo necesita.
 *
 * El texto largo va PROYECTADO: lo que se unifica es la forma, no el mensaje —
 * cada pantalla sigue explicando lo suyo (y varias explican, además de que no
 * hay nada, qué pasa mientras no lo haya).
 *
 * ```html
 * <ui-estado-vacio icono="🏷" titulo="Todavía no hay roles en este grupo">
 *   Sin roles, todas las actividades las ven todos los integrantes.
 * </ui-estado-vacio>
 * ```
 */
@Component({
  selector: 'ui-estado-vacio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `block` para que el margen que le pone la página (`class="mt-6"`) tenga
  // efecto: un custom element es inline por defecto.
  host: { class: 'block' },
  template: `
    <div
      class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"
    >
      @if (icono()) {
        <p class="text-3xl" aria-hidden="true">{{ icono() }}</p>
      }

      @if (titulo()) {
        <p class="font-semibold text-slate-700 dark:text-slate-200" [class.mt-2]="icono()">
          {{ titulo() }}
        </p>
      }

      <div
        class="text-sm text-slate-500 dark:text-slate-400"
        [class.mt-1]="titulo()"
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class EstadoVacioComponent {
  /** Emoji ilustrativo. Va `aria-hidden`: no aporta nada a quien usa lector. */
  readonly icono = input<string>('');

  readonly titulo = input<string>('');
}
