import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Etiqueta + control de formulario (fase-14-23 T2).
 *
 * Reemplaza los 63 pares `<label class="block"><span …>Nombre</span><input …>`
 * del área Tutor. Envuelve el control proyectado en un `<label>` real, así
 * hacer click en la etiqueta enfoca el campo — hoy eso funciona en algunas
 * pantallas y en otras no, según cómo se copió el bloque.
 *
 * El control lo pone la página (con la clase `.campo`), no el componente: hay
 * inputs, selects, textareas, grupos de checkboxes y hasta paletas de color
 * bajo la misma etiqueta, y un `<ui-input>` tendría que modelarlos todos.
 *
 * ```html
 * <ui-campo etiqueta="Nombre" ayuda="Máximo 30 caracteres">
 *   <input class="campo" [(ngModel)]="nombre" name="nombre" />
 * </ui-campo>
 * ```
 */
@Component({
  selector: 'ui-campo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `block` para que el margen que le pone la página (`class="mt-4"`) tenga
  // efecto: un custom element es inline por defecto.
  host: { class: 'block' },
  template: `
    <!--
      El control va PROYECTADO adentro del <label>, que es una asociación
      válida por HTML sin necesidad de for/id. La regla no puede ver a través
      de <ng-content>, así que acá da un falso positivo.
    -->
    <!-- eslint-disable-next-line @angular-eslint/template/label-has-associated-control -->
    <label class="block">
      <span class="etiqueta-campo">
        {{ etiqueta() }}
        @if (opcional()) {
          <span class="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
        }
      </span>

      <div class="mt-1">
        <ng-content />
      </div>

      @if (ayuda() && !error()) {
        <span class="mt-1 block text-xs text-slate-400 dark:text-slate-500">{{ ayuda() }}</span>
      }

      @if (error()) {
        <span class="mt-1 block text-xs font-semibold text-red-600 dark:text-red-400" role="alert">
          {{ error() }}
        </span>
      }
    </label>
  `,
})
export class CampoComponent {
  readonly etiqueta = input.required<string>();

  /** Texto de apoyo bajo el control. Lo tapa `error` mientras haya error. */
  readonly ayuda = input<string>('');

  readonly error = input<string>('');

  readonly opcional = input<boolean>(false);
}
