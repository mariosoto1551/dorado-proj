import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { EtiquetaCatalogoDto } from '@dorado/shared-types';

/**
 * Chip de etiqueta (fase-14-26). El color **viene de la API** y no se hardcodea
 * en ningún lado (mismo criterio que `UmbralZona.colorHex` desde Fase 7), así
 * que el estilo se arma con `style` inline y no con clases de Tailwind: las
 * utilidades se compilan de antemano y no pueden interpolar un `#RRGGBB` que
 * el Tutor eligió en tiempo de ejecución.
 *
 * Sin relleno sólido a propósito: el texto sobre un color arbitrario podría
 * quedar ilegible, y acá el Tutor elige libre. Borde y texto del color, fondo
 * translúcido — se lee igual en claro y en oscuro. Cuando está `activa` sube
 * la opacidad del fondo en vez de usar un `ring`, que dependería de variables
 * internas de Tailwind para tomar un color dinámico.
 */
@Component({
  selector: 'app-etiqueta-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold leading-4 transition"
      [style.color]="etiqueta().colorHex"
      [style.border-color]="etiqueta().colorHex"
      [style.background-color]="fondo()"
    >
      <span class="h-1.5 w-1.5 rounded-full" [style.background-color]="etiqueta().colorHex"></span>
      {{ etiqueta().nombre }}
      @if (sufijo()) {
        <span class="font-medium opacity-70">{{ sufijo() }}</span>
      }
    </span>
  `,
})
export class EtiquetaChipComponent {
  readonly etiqueta = input.required<EtiquetaCatalogoDto>();

  /** Resaltado, para el chip elegido en un filtro o en un selector. */
  readonly activa = input(false);

  readonly sufijo = input<string | null>(null);

  /** `#RRGGBB` + alfa de 8 dígitos: soportado por todos los navegadores target. */
  protected readonly fondo = computed(
    () => `${this.etiqueta().colorHex}${this.activa() ? '33' : '14'}`
  );
}
