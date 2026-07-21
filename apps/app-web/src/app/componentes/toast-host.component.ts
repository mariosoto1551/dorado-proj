import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService, type Toast } from './toast.service';

/** Contenedor global de toasts (montado en la raíz). */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pointer-events-none fixed inset-x-0 top-3 z-60 flex flex-col items-center gap-2 px-3">
      @for (t of toasts.lista(); track t.id) {
        <button
          type="button"
          class="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl px-4 py-3 text-left text-sm font-medium shadow-lg animate-slide-up"
          [class]="clase(t.tono)"
          (click)="toasts.descartar(t.id)"
        >
          <span class="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-current opacity-80"></span>
          <span class="flex-1">{{ t.texto }}</span>
        </button>
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);

  protected clase(tono: Toast['tono']): string {
    switch (tono) {
      case 'exito':
        return 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200';
      case 'error':
        return 'bg-red-50 text-red-800 ring-1 ring-red-200';
      default:
        return 'bg-slate-800 text-white';
    }
  }
}
