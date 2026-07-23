import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type EstadoSeccionVisual = 'ABIERTA' | 'EVALUACION' | 'CERRADA';

/**
 * Badge visual para el estado de una Sección (spec fase-10). Reusado en el
 * resumen de grupo, el panel operativo y el de evaluación — para no
 * reimplementar el estilo/colores del estado en cada pantalla.
 */
@Component({
  selector: 'ui-estado-seccion-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap"
      [class]="clase()"
    >
      <span class="h-1.5 w-1.5 rounded-full bg-current"></span>
      {{ etiqueta() }}
    </span>
  `,
})
export class EstadoSeccionBadgeComponent {
  readonly estado = input.required<EstadoSeccionVisual>();

  protected readonly etiqueta = computed(() => {
    switch (this.estado()) {
      case 'ABIERTA':
        return 'En curso';
      case 'EVALUACION':
        return 'En evaluación';
      case 'CERRADA':
        return 'Cerrada';
    }
  });

  protected readonly clase = computed(() => {
    switch (this.estado()) {
      case 'ABIERTA':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';
      case 'EVALUACION':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
      case 'CERRADA':
        return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
    }
  });
}
