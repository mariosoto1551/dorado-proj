import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Forma mínima de zona que el badge necesita. UmbralZonaDto de
 * @dorado/shared-types es estructuralmente asignable a esto — se define local
 * a propósito para que shared-ui no dependa de shared-types (regla de límites
 * de Nx) y para poder pasarle también el snapshot de zona de una recompensa.
 */
export interface ZonaVisual {
  nombreZona: string;
  colorHex: string;
}

/**
 * Único componente que renderiza una zona (spec fase-10). El color SIEMPRE
 * viene del dato (`UmbralZona.colorHex` de la API), nunca hardcodeado — ver
 * CLAUDE.md. El color de texto se calcula por contraste sobre el fondo.
 */
@Component({
  selector: 'ui-zona-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (zona()) {
      <span
        class="inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap"
        [class]="claseTamano()"
        [style.background-color]="zona()!.colorHex"
        [style.color]="colorTexto()"
      >
        <span
          class="rounded-full bg-current opacity-70"
          [class]="claseDot()"
        ></span>
        {{ zona()!.nombreZona }}
      </span>
    } @else {
      <span
        class="inline-flex items-center rounded-full bg-slate-200 font-semibold text-slate-500 whitespace-nowrap dark:bg-slate-700 dark:text-slate-300"
        [class]="claseTamano()"
      >
        Sin zona
      </span>
    }
  `,
})
export class ZonaBadgeComponent {
  readonly zona = input<ZonaVisual | null>(null);

  readonly tamano = input<'sm' | 'md' | 'lg'>('md');

  protected readonly claseTamano = computed(() => {
    switch (this.tamano()) {
      case 'sm':
        return 'px-2 py-0.5 text-xs';
      case 'lg':
        return 'px-4 py-1.5 text-base';
      default:
        return 'px-3 py-1 text-sm';
    }
  });

  protected readonly claseDot = computed(() =>
    this.tamano() === 'lg' ? 'h-2.5 w-2.5' : 'h-2 w-2'
  );

  protected readonly colorTexto = computed(() =>
    this.esOscuro(this.zona()?.colorHex ?? '#000000') ? '#ffffff' : '#0f172a'
  );

  /** Luminancia relativa aproximada → decide texto blanco vs. slate-900. */
  private esOscuro(hex: string): boolean {
    const limpio = hex.replace('#', '');

    if (limpio.length !== 6) {
      return true;
    }

    const r = parseInt(limpio.slice(0, 2), 16);
    const g = parseInt(limpio.slice(2, 4), 16);
    const b = parseInt(limpio.slice(4, 6), 16);
    const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    return luminancia < 0.6;
  }
}
