import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Diálogo de confirmación del panel (dark). Controlado por el padre vía el
 * input `abierto`; emite `confirmar` o `cancelar`. Usado para cambio de plan y
 * suspensión/reactivación de organizaciones.
 */
@Component({
  selector: 'admin-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (abierto()) {
      <div class="overlay">
        <button type="button" class="overlay-backdrop" aria-label="Cerrar" (click)="cancelar.emit()"></button>
        <div class="modal" role="dialog" aria-modal="true">
          <h3>{{ titulo() }}</h3>
          <p>{{ mensaje() }}</p>
          <div class="row">
            <button type="button" class="btn" (click)="cancelar.emit()">Cancelar</button>
            <button
              type="button"
              class="btn"
              [class.primary]="tono() === 'primary'"
              [class.danger]="tono() === 'danger'"
              [disabled]="cargando()"
              (click)="confirmar.emit()"
            >
              {{ cargando() ? 'Aplicando…' : textoConfirmar() }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialogComponent {
  readonly abierto = input.required<boolean>();

  readonly titulo = input.required<string>();

  readonly mensaje = input.required<string>();

  readonly textoConfirmar = input('Confirmar');

  readonly tono = input<'primary' | 'danger'>('primary');

  readonly cargando = input(false);

  readonly confirmar = output<void>();

  readonly cancelar = output<void>();
}
