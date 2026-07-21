import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * Diálogo de confirmación para toda acción destructiva o irreversible
 * (descalificar, revocar invitación, archivar, forzar cierre) — spec fase-10.
 * Controlado: el padre maneja `abierto` y reacciona a (confirmar)/(cancelar).
 *
 * Si `requiereMotivo` es true, muestra un textarea obligatorio y (confirmar)
 * emite el texto ingresado (caso "descalificar con motivo obligatorio" del
 * panel de evaluación). Si es false, emite cadena vacía.
 */
@Component({
  selector: 'ui-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (abierto()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <button
          type="button"
          aria-label="Cerrar"
          (click)="cancelar.emit()"
          class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"
        ></button>
        <div
          class="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up sm:rounded-2xl"
          role="dialog"
          aria-modal="true"
        >
          <h2 class="text-lg font-bold text-slate-900">{{ titulo() }}</h2>

          @if (mensaje()) {
            <p class="mt-2 text-sm text-slate-600">{{ mensaje() }}</p>
          }

          @if (requiereMotivo()) {
            <textarea
              [value]="motivo()"
              (input)="motivo.set($any($event.target).value)"
              rows="3"
              [placeholder]="placeholderMotivo()"
              class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
            ></textarea>
          }

          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              (click)="cancelar.emit()"
              class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {{ textoCancelar() }}
            </button>
            <button
              type="button"
              (click)="onConfirmar()"
              [disabled]="requiereMotivo() && motivo().trim().length === 0"
              class="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
              [class]="claseConfirmar()"
            >
              {{ textoConfirmar() }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialogComponent {
  readonly abierto = input<boolean>(false);

  readonly titulo = input<string>('¿Confirmás?');

  readonly mensaje = input<string>('');

  readonly textoConfirmar = input<string>('Confirmar');

  readonly textoCancelar = input<string>('Cancelar');

  readonly tono = input<'peligro' | 'primario'>('peligro');

  readonly requiereMotivo = input<boolean>(false);

  readonly placeholderMotivo = input<string>('Motivo…');

  readonly confirmar = output<string>();

  readonly cancelar = output<void>();

  protected readonly motivo = signal('');

  protected readonly claseConfirmar = computed(() =>
    this.tono() === 'peligro'
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-marca-600 hover:bg-marca-700'
  );

  constructor() {
    // Limpia el motivo cada vez que el diálogo se reabre.
    effect(() => {
      if (this.abierto()) {
        this.motivo.set('');
      }
    });
  }

  protected onConfirmar(): void {
    if (this.requiereMotivo() && this.motivo().trim().length === 0) {
      return;
    }

    this.confirmar.emit(this.motivo().trim());
  }
}
