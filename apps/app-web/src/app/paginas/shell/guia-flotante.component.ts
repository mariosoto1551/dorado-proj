import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { IconoComponent } from '../../componentes/icono.component';
import { PASOS_GUIA, type PasoGuia } from '../../core/guia/guia-pasos';
import { EstadoPasos, GuiaSetupService } from '../../core/guia/guia-setup.service';

/**
 * Widget flotante de "primeros pasos" (fase-14): acompaña al tutor en todas las
 * páginas del setup para que vea su progreso y salte al siguiente paso sin
 * volver a la página de guía. Colapsado es una pastilla con anillo de progreso;
 * expandido, un checklist compacto. El shell decide cuándo mostrarlo.
 */
@Component({
  selector: 'app-guia-flotante',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent],
  template: `
    <!-- Pastilla colapsada -->
    @if (!abierto()) {
      <button
        type="button"
        (click)="abierto.set(true)"
        class="fixed right-4 bottom-4 z-30 flex items-center gap-2.5 rounded-full bg-marca-600 py-2 pr-4 pl-2 text-sm font-semibold text-white shadow-lg shadow-marca-600/30 transition hover:bg-marca-700"
        [attr.aria-label]="'Primeros pasos: ' + guia.completados() + ' de ' + guia.totalPasos"
      >
        <span class="relative grid h-9 w-9 place-items-center">
          <svg class="h-9 w-9 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" stroke-width="4" opacity="0.25" />
            <circle
              cx="18" cy="18" r="15" fill="none" stroke="currentColor" stroke-width="4"
              stroke-linecap="round" [attr.stroke-dasharray]="circunferencia"
              [attr.stroke-dashoffset]="anilloOffset()"
            />
          </svg>
          <span class="absolute text-[11px] font-bold tabular-nums">{{ guia.completados() }}/{{ guia.totalPasos }}</span>
        </span>
        Primeros pasos
      </button>
    }

    <!-- Panel expandido -->
    @if (abierto()) {
      <button
        type="button"
        aria-label="Cerrar"
        (click)="abierto.set(false)"
        class="fixed inset-0 z-30 cursor-default bg-slate-900/20 animate-fade-in sm:bg-transparent"
      ></button>

      <div
        class="fixed right-4 bottom-4 z-40 flex max-h-[70dvh] w-[calc(100vw-2rem)] max-w-xs flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-slide-up dark:border-slate-700 dark:bg-slate-900"
        role="dialog"
        aria-label="Primeros pasos"
      >
        <div class="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div class="min-w-0">
            <p class="text-sm font-bold text-slate-900 dark:text-white">Primeros pasos</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ guia.completados() }} de {{ guia.totalPasos }} completados</p>
          </div>
          <button
            type="button"
            (click)="abierto.set(false)"
            class="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <span class="h-4 w-4"><app-icono nombre="x" /></span>
          </button>
        </div>

        <div class="h-1.5 bg-slate-100 dark:bg-slate-800">
          <div class="h-full bg-marca-600 transition-all duration-700" [style.width.%]="porcentaje()"></div>
        </div>

        <ul class="flex-1 overflow-y-auto p-2">
          @for (paso of pasos; track paso.clave) {
            <li>
              <a
                [routerLink]="['/grupos', grupoId(), ...paso.segmentos]"
                (click)="abierto.set(false)"
                class="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                [class.bg-marca-50]="esSiguiente(paso)"
                [class.dark:bg-marca-900/20]="esSiguiente(paso)"
              >
                <span
                  class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold"
                  [class]="claseIndicador(paso)"
                >
                  @if (paso.opcional) {
                    <span class="h-4 w-4"><app-icono nombre="cog" /></span>
                  } @else if (hecho(paso)) {
                    <span class="h-4 w-4"><app-icono nombre="check" /></span>
                  } @else {
                    {{ paso.numero }}
                  }
                </span>
                <span class="min-w-0 flex-1">
                  <span
                    class="block truncate text-sm font-medium text-slate-800 dark:text-slate-100"
                    [class.line-through]="hecho(paso)"
                    [class.text-slate-400]="hecho(paso)"
                    [class.dark:text-slate-500]="hecho(paso)"
                  >
                    {{ paso.titulo }}
                    @if (paso.opcional) {
                      <span class="text-xs font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
                    }
                  </span>
                </span>
                <span class="h-4 w-4 flex-none text-slate-300 dark:text-slate-600"><app-icono nombre="chevron" /></span>
              </a>
            </li>
          }
        </ul>

        <a
          [routerLink]="['/grupos', grupoId(), 'guia']"
          (click)="abierto.set(false)"
          class="border-t border-slate-100 px-4 py-2.5 text-center text-xs font-semibold text-marca-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-marca-400 dark:hover:bg-slate-800/60"
        >
          Ver la guía completa
        </a>
      </div>
    }
  `,
})
export class GuiaFlotanteComponent {
  readonly grupoId = input.required<string>();

  protected readonly guia = inject(GuiaSetupService);

  protected readonly abierto = signal(false);

  protected readonly pasos = PASOS_GUIA;

  protected readonly circunferencia = 2 * Math.PI * 15;

  protected readonly anilloOffset = computed(
    () => this.circunferencia * (1 - this.guia.completados() / this.guia.totalPasos)
  );

  protected readonly porcentaje = computed(() =>
    Math.round((this.guia.completados() / this.guia.totalPasos) * 100)
  );

  /** Primer paso obligatorio sin hacer: es el "siguiente" a resaltar. */
  private readonly siguienteClave = computed<PasoGuia['clave'] | null>(() => {
    const estado = this.guia.estado();

    for (const paso of PASOS_GUIA) {
      if (!paso.opcional && !estado[paso.clave as keyof EstadoPasos]) {
        return paso.clave;
      }
    }

    return null;
  });

  protected hecho(paso: PasoGuia): boolean {
    if (paso.opcional) {
      return false;
    }

    return this.guia.estado()[paso.clave as keyof EstadoPasos];
  }

  protected esSiguiente(paso: PasoGuia): boolean {
    return paso.clave === this.siguienteClave();
  }

  protected claseIndicador(paso: PasoGuia): string {
    if (paso.opcional) {
      return 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
    }

    if (this.hecho(paso)) {
      return 'bg-emerald-500 text-white';
    }

    return 'bg-marca-100 text-marca-700 dark:bg-marca-900/40 dark:text-marca-300';
  }
}
