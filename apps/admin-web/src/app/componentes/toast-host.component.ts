import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService } from './toast.service';

/** Contenedor global de toasts (montado en la raíz). */
@Component({
  selector: 'admin-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-host">
      @for (t of toasts.lista(); track t.id) {
        <button
          type="button"
          class="toast"
          [class.err]="t.tono === 'error'"
          (click)="toasts.descartar(t.id)"
        >
          <span class="d"></span>
          <span>{{ t.texto }}</span>
        </button>
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
}
