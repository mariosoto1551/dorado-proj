import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { RendimientoZonaDto } from '@dorado/shared-types';

import { ToastService } from '../../../componentes/toast.service';
import { mensajeDeError } from '../../../core/api/errores';
import { RewardsApiService } from '../../../core/api/rewards-api.service';

/**
 * Preset sugerido al activar la tienda. La decisión real del Tutor es UNA
 * (¿modo simple o economía?), no cuatro números — esto le da algo que ya
 * funciona y queda editable.
 *
 * OJO con el −5 de la zona más baja: con ese valor, quien no ahorró cae en
 * bancarrota y recibe castigo CADA vez que queda en rojo. Es la regla
 * funcionando, pero el aviso de abajo lo hace explícito antes de guardar.
 */
const PRESET: Record<number, number> = { 1: -5, 2: 5, 3: 12, 4: 25 };

@Component({
  selector: 'app-rendimientos-zona',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="tarjeta">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-bold text-slate-900 dark:text-white">Cuánto rinde cada zona</p>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Se acredita al cerrar la semana, según la zona que alcanzó cada integrante.
          </p>
        </div>
        <button
          type="button"
          (click)="cargarPreset()"
          class="boton boton-neutro boton-sm"
        >
          Cargar sugeridos
        </button>
      </div>

      @if (cargando()) {
        <p class="mt-6 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (filas().length === 0) {
        <p class="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
          Este grupo todavía no tiene zonas. Definilas en «Zonas» antes de configurar el rendimiento.
        </p>
      } @else {
        <ul class="mt-4 space-y-2">
          @for (fila of filas(); track fila.umbralZonaId) {
            <li class="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
              <span class="h-3 w-3 shrink-0 rounded-full" [style.background-color]="fila.colorHex"></span>
              <span class="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {{ fila.nombreZona }}
              </span>
              <input
                type="number"
                [(ngModel)]="valores[fila.umbralZonaId]"
                [name]="'rend-' + fila.umbralZonaId"
                class="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-right text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              />
            </li>
          }
        </ul>

        @if (hayNegativos()) {
          <p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30">
            Con rendimiento negativo, quien quede sin saldo recibe un <b>castigo al azar</b> y su
            saldo vuelve a 0. Si no cargaste castigos en el catálogo, el saldo simplemente queda
            en 0 y no pasa nada más.
          </p>
        }

        <div class="mt-4 flex justify-end">
          <button
            type="button"
            (click)="guardar()"
            [disabled]="guardando()"
            class="boton boton-primario"
          >
            {{ guardando() ? 'Guardando…' : 'Guardar rendimiento' }}
          </button>
        </div>
      }
    </div>
  `,
})
export class RendimientosComponent {
  readonly grupoId = input.required<string>();

  private readonly api = inject(RewardsApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly guardando = signal(false);

  protected readonly filas = signal<RendimientoZonaDto[]>([]);

  protected readonly hayNegativos = signal(false);

  protected valores: Record<string, number> = {};

  constructor() {
    effect(() => this.cargar(this.grupoId()));
  }

  protected cargarPreset(): void {
    for (const fila of this.filas()) {
      this.valores[fila.umbralZonaId] = PRESET[fila.orden] ?? 0;
    }

    this.recalcularAviso();
  }

  protected guardar(): void {
    this.guardando.set(true);

    const rendimientos = this.filas().map((fila) => ({
      umbralZonaId: fila.umbralZonaId,
      monedas: Number(this.valores[fila.umbralZonaId] ?? 0),
    }));

    this.api.configurarRendimientos(this.grupoId(), { rendimientos }).subscribe({
      next: (actualizados) => {
        this.filas.set(actualizados);
        this.guardando.set(false);
        this.toasts.exito('Rendimiento guardado.');
        this.recalcularAviso();
      },
      error: (e) => {
        this.guardando.set(false);
        this.toasts.error(mensajeDeError(e));
      },
    });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);

    this.api.rendimientos(grupoId).subscribe({
      next: (filas) => {
        this.filas.set(filas);
        this.valores = Object.fromEntries(
          filas.map((fila) => [fila.umbralZonaId, fila.monedas ?? 0])
        );
        this.cargando.set(false);
        this.recalcularAviso();
      },
      error: () => this.cargando.set(false),
    });
  }

  private recalcularAviso(): void {
    this.hayNegativos.set(Object.values(this.valores).some((valor) => Number(valor) < 0));
  }
}
