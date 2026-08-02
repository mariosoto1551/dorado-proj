import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ModoRecompensas, type ConfiguracionRecompensasGrupoDto } from '@dorado/shared-types';
import { CampoComponent, ModalComponent } from '@dorado/shared-ui';

import { ToastService } from '../../../componentes/toast.service';
import { mensajeDeError } from '../../../core/api/errores';
import { RewardsApiService } from '../../../core/api/rewards-api.service';

/**
 * El interruptor de modo (fase-14-22 decisiones 1 y 9). Manda sobre todo lo
 * demás de la pantalla, por eso va arriba de las pestañas y no adentro de una.
 */
@Component({
  selector: 'app-modo-recompensas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, CampoComponent, FormsModule],
  template: `
    <!-- Sin tarjeta propia: desde la T3 vive DENTRO del bloque «Qué se gana»
         del hub, que ya es una tarjeta. Anidar dos daba borde sobre borde. -->
    <div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm font-bold text-slate-900 dark:text-white">Modo de recompensas</p>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {{
              config().modo === 'TIENDA'
                ? 'Se gana moneda al cerrar la semana y los premios se compran en la tienda.'
                : 'Al cerrar la semana se elige o se sortea un premio de la zona alcanzada.'
            }}
          </p>
        </div>

        <div class="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          @for (opcion of OPCIONES; track opcion.valor) {
            <button
              type="button"
              (click)="elegir(opcion.valor)"
              [class]="
                config().modo === opcion.valor
                  ? 'rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-marca-700 shadow-sm transition dark:bg-slate-950 dark:text-marca-300'
                  : 'rounded-lg px-4 py-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              "
            >
              {{ opcion.etiqueta }}
            </button>
          }
        </div>
      </div>

      @if (config().modoPendiente) {
        <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
          Queda pendiente pasar a <b>{{ config().modoPendiente }}</b> cuando empiece la próxima
          semana. Volvé a elegir el modo actual para cancelarlo.
        </p>
      }

      @if (config().modo === 'TIENDA') {
        <div class="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <ui-campo etiqueta="Nombre de la moneda">
            <input
              [(ngModel)]="nombreMoneda"
              name="nombreMoneda"
              maxlength="20"
              class="w-40 campo"
            />
          </ui-campo>
          <ui-campo etiqueta="Ícono">
            <input
              [(ngModel)]="iconoMoneda"
              name="iconoMoneda"
              maxlength="8"
              class="campo w-20 text-center"
            />
          </ui-campo>
          <button
            type="button"
            (click)="guardarMoneda()"
            [disabled]="guardando()"
            class="boton boton-neutro"
          >
            Guardar
          </button>
          <p class="text-xs text-slate-400 dark:text-slate-500">
            Se muestra así: «12 {{ nombreMoneda }}» {{ iconoMoneda }}
          </p>
        </div>
      }
    </div>

    <ui-modal
      [abierto]="confirmando() !== null"
      [titulo]="'Cambiar a ' + (confirmando() ?? '')"
      (cerrar)="confirmando.set(null)"
    >
      @if (confirmando(); as destino) {
          <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
            @if (destino === 'TIENDA') {
              Los premios pasan a comprarse con moneda. Configurá cuánto rinde cada zona en la
              pestaña «Rendimiento».
            } @else {
              Se vuelve al premio directo por zona. <b>Las billeteras no se borran</b>: si volvés a
              activar la tienda, las monedas siguen ahí.
            }
          </p>

          <div class="mt-4 space-y-2">
            <button
              type="button"
              (click)="aplicar(destino, false)"
              class="w-full rounded-xl border-2 border-marca-500 bg-marca-50 p-3 text-left transition hover:bg-marca-100 dark:border-marca-400 dark:bg-marca-500/10 dark:hover:bg-marca-500/20"
            >
              <span class="block text-sm font-bold text-marca-800 dark:text-marca-200">Desde la próxima semana</span>
              <span class="block text-xs text-marca-700 dark:text-marca-300">
                La semana en curso termina con las reglas de ahora. Recomendado.
              </span>
            </button>
            <button
              type="button"
              (click)="aplicar(destino, true)"
              class="w-full rounded-xl border border-slate-300 p-3 text-left transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <span class="block text-sm font-bold text-slate-800 dark:text-slate-100">Aplicar ahora</span>
              <span class="block text-xs text-slate-500 dark:text-slate-400">
                Cambia también cómo cierra la semana en curso.
              </span>
            </button>
          </div>

          <button
            type="button"
            (click)="confirmando.set(null)"
            class="mt-3 w-full boton boton-neutro"
          >
            Cancelar
          </button>
      }
    </ui-modal>
  `,
})
export class ModoRecompensasComponent {
  readonly grupoId = input.required<string>();

  readonly config = input.required<ConfiguracionRecompensasGrupoDto>();

  readonly cambiado = output<ConfiguracionRecompensasGrupoDto>();

  private readonly api = inject(RewardsApiService);

  private readonly toasts = inject(ToastService);

  protected readonly OPCIONES = [
    { valor: ModoRecompensas.DIRECTO, etiqueta: 'Premio directo' },
    { valor: ModoRecompensas.TIENDA, etiqueta: 'Tienda' },
  ];

  protected readonly confirmando = signal<ModoRecompensas | null>(null);

  protected readonly guardando = signal(false);

  protected nombreMoneda = '';

  protected iconoMoneda = '';

  constructor() {
    // Los cosméticos se editan localmente hasta que el tutor los guarda.
    queueMicrotask(() => {
      this.nombreMoneda = this.config().nombreMoneda;
      this.iconoMoneda = this.config().iconoMoneda;
    });
  }

  protected elegir(destino: ModoRecompensas): void {
    // Elegir el modo ya vigente CANCELA un pendiente: se manda igual, sin diálogo.
    if (destino === this.config().modo) {
      if (this.config().modoPendiente) {
        this.aplicar(destino, false);
      }

      return;
    }

    this.confirmando.set(destino);
  }

  protected aplicar(modo: ModoRecompensas, aplicarAhora: boolean): void {
    this.api.cambiarModo(this.grupoId(), { modo, aplicarAhora }).subscribe({
      next: (config) => {
        this.confirmando.set(null);
        this.toasts.exito(
          config.modoPendiente
            ? 'El cambio se aplica al empezar la próxima semana.'
            : 'Modo actualizado.'
        );
        this.cambiado.emit(config);
      },
      error: (e) => this.toasts.error(mensajeDeError(e)),
    });
  }

  protected guardarMoneda(): void {
    this.guardando.set(true);

    this.api
      .cambiarModo(this.grupoId(), {
        // Mandar el modo vigente no lo cambia; solo viajan los cosméticos.
        modo: this.config().modo,
        nombreMoneda: this.nombreMoneda.trim() || 'monedas',
        iconoMoneda: this.iconoMoneda.trim() || '🪙',
      })
      .subscribe({
        next: (config) => {
          this.guardando.set(false);
          this.toasts.exito('Moneda actualizada.');
          this.cambiado.emit(config);
        },
        error: (e) => {
          this.guardando.set(false);
          this.toasts.error(mensajeDeError(e));
        },
      });
  }
}
