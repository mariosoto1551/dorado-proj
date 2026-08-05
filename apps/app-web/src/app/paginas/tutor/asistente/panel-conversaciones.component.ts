import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { ConversacionIaDto } from '@dorado/shared-types';

import { IconoComponent } from '../../../componentes/icono.component';

/**
 * Historial de conversaciones, en un panel que se abre desde el encabezado
 * (fase-14-29 tanda 6, decisión de layout de José).
 *
 * Es un panel y no una columna fija: el área Tutor ya gasta una columna en la
 * sidebar del menú, y una segunda dejaría el chat en un tercio de la pantalla
 * en escritorio y obligaría a mantener dos layouts. Acá hay uno solo, y en
 * mobile el panel es lo mismo con otro ancho.
 */
@Component({
  selector: 'app-panel-conversaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    @if (abierto()) {
      <div
        class="fixed inset-0 z-40 animate-fade-in bg-slate-900/40 backdrop-blur-[2px]"
        (click)="cerrar.emit()"
        aria-hidden="true"
      ></div>

      <aside
        class="fixed top-0 right-0 z-50 flex h-full w-80 max-w-[85vw] animate-slide-up flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
        role="dialog"
        aria-label="Conversaciones"
      >
        <header class="flex items-center gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 class="flex-1 font-semibold text-slate-900 dark:text-white">Conversaciones</h2>
          <button
            type="button"
            class="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            (click)="cerrar.emit()"
            aria-label="Cerrar"
          >
            <span class="block h-5 w-5"><app-icono nombre="x" /></span>
          </button>
        </header>

        <div class="p-3">
          <button
            type="button"
            class="boton boton-primario w-full"
            (click)="nueva.emit()"
          >
            <span class="h-4 w-4"><app-icono nombre="plus" /></span>
            Conversación nueva
          </button>
        </div>

        <ul class="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          @for (conversacion of conversaciones(); track conversacion.id) {
            <li>
              <button
                type="button"
                class="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
                [class]="
                  conversacion.id === activaId()
                    ? 'bg-marca-50 dark:bg-marca-900/30'
                    : ''
                "
                (click)="elegir.emit(conversacion.id)"
              >
                <span class="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {{ conversacion.titulo }}
                </span>
                <span class="block text-xs text-slate-400 dark:text-slate-500">
                  {{ cuando(conversacion.updatedAt) }}
                </span>
              </button>
            </li>
          } @empty {
            <li class="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              Todavía no hablaste con el asistente en este grupo.
            </li>
          }
        </ul>
      </aside>
    }
  `,
})
export class PanelConversacionesComponent {
  readonly abierto = input(false);

  readonly conversaciones = input<readonly ConversacionIaDto[]>([]);

  readonly activaId = input<string | null>(null);

  readonly elegir = output<string>();

  readonly nueva = output<void>();

  readonly cerrar = output<void>();

  /** Fecha corta y en castellano; el título ya dice de qué se habló. */
  protected cuando(iso: string): string {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
