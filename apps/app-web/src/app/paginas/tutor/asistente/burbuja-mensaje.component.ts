import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { MensajeIaDto } from '@dorado/shared-types';

/**
 * Un mensaje de la conversación (fase-14-29 tanda 6).
 *
 * **Los mensajes de rol `HERRAMIENTA` no se dibujan acá.** En el ledger son
 * filas de auditoría («ok (2186 bytes)»), no algo que alguien quiera leer: lo
 * que el Tutor ve de una herramienta es el rastro de arriba («leí el
 * catálogo»), que lo arma la pantalla con los eventos del stream. Mostrar la
 * fila cruda sería mostrar el log en vez de la conversación.
 */
@Component({
  selector: 'app-burbuja-mensaje',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="flex animate-fade-in" [class.justify-end]="esDelUsuario()">
        <div
          class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap"
          [class]="tono()"
        >{{ mensaje().contenido }}</div>
      </div>
    }
  `,
})
export class BurbujaMensajeComponent {
  readonly mensaje = input.required<MensajeIaDto>();

  protected readonly esDelUsuario = computed(() => this.mensaje().rol === 'USUARIO');

  /**
   * Un turno del asistente que fue **solo** llamadas a herramientas queda con
   * el texto vacío en el ledger. Dibujar esa burbuja dejaría un globo en
   * blanco en el medio de la conversación.
   */
  protected readonly visible = computed(() => {
    const mensaje = this.mensaje();

    return (
      (mensaje.rol === 'USUARIO' || mensaje.rol === 'ASISTENTE') && mensaje.contenido.trim() !== ''
    );
  });

  protected readonly tono = computed(() =>
    this.esDelUsuario()
      ? 'bg-marca-600 text-white rounded-br-md'
      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800'
  );
}
