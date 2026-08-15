import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';

/**
 * Número con signo, sin depender de que el teclado del celular tenga un «−»
 * (fase-14-34).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ES UN `<input type="number">`.
 *
 * En un `type="number"`, el teclado que abre el celular lo elige el sistema, y
 * en varios (iOS entero, varios Android con teclados de fábrica) ese teclado es
 * un pad de 10 dígitos **sin la tecla del menos**. En esos teléfonos, un campo
 * que dice «negativo para restar» es un campo donde restar es literalmente
 * imposible: no hay forma de tipear el signo.
 *
 * Así que el signo deja de ser un carácter que hay que tipear y pasa a ser lo
 * que siempre fue en la cabeza de quien ajusta: **una elección entre sumar y
 * restar**, con dos botones. La caja de texto queda con la magnitud, siempre
 * positiva, y ahí un pad de dígitos alcanza y sobra.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ```html
 * <app-entrada-con-signo [(valor)]="puntosAjuste" etiquetaSumar="Sumar" />
 * ```
 */
@Component({
  selector: 'app-entrada-con-signo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex items-stretch gap-2">
      <div
        class="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700"
        role="group"
        [attr.aria-label]="'Sumar o restar ' + unidad()"
      >
        <button
          type="button"
          (click)="elegirSigno(1)"
          [attr.aria-pressed]="signo() === 1"
          [class]="clasesBoton(1)"
        >
          + {{ etiquetaSumar() }}
        </button>
        <button
          type="button"
          (click)="elegirSigno(-1)"
          [attr.aria-pressed]="signo() === -1"
          [class]="clasesBoton(-1)"
        >
          − {{ etiquetaRestar() }}
        </button>
      </div>

      <!--
        type="text" + inputmode="numeric", no type="number": ese último acepta
        «e» y «.» y después reporta el campo vacío cuando el contenido no es un
        número válido, que es la otra mitad del problema. Acá entra lo que
        entra, se limpia a dígitos y el valor sale entero.
      -->
      <input
        type="text"
        inputmode="numeric"
        autocomplete="off"
        [value]="texto()"
        (input)="escribir($any($event.target).value)"
        [attr.aria-label]="unidad()"
        class="w-24 campo tabular-nums"
      />
    </div>
  `,
})
export class EntradaConSignoComponent {
  /** Con signo ya aplicado: es lo que el endpoint de ajuste espera. */
  readonly valor = model<number>(0);

  readonly etiquetaSumar = input('Sumar');

  readonly etiquetaRestar = input('Restar');

  /** Para los lectores de pantalla: «puntos», «monedas». */
  readonly unidad = input('puntos');

  protected readonly signo = signal<1 | -1>(1);

  /** Lo tipeado, crudo. No es `Math.abs(valor)` a propósito: ver `escribir`. */
  protected readonly texto = signal('');

  /** El valor que produce este control tal como está ahora. */
  private readonly valorTipeado = computed(() => {
    const magnitud = parseInt(this.texto(), 10);

    return Number.isNaN(magnitud) ? 0 : this.signo() * Math.abs(magnitud);
  });

  constructor() {
    // El padre también escribe: resetea a 0 después de guardar, o abre el
    // modal con un valor. Se reconstruye la pantalla desde el valor SOLO
    // cuando no es el que este control acaba de producir — si no, escribir
    // «12» reescribiría «12» encima de lo que se está tipeando y el cursor
    // saltaría al final en cada tecla.
    effect(() => {
      const valor = this.valor();

      if (valor === untracked(this.valorTipeado)) {
        return;
      }

      untracked(() => {
        this.texto.set(valor === 0 ? '' : String(Math.abs(valor)));

        // Un 0 de afuera limpia la caja pero NO mueve el signo: es el reset
        // de después de guardar, y quien viene restando de a uno espera que
        // «Restar» siga elegido para el siguiente.
        if (valor !== 0) {
          this.signo.set(valor < 0 ? -1 : 1);
        }
      });
    });
  }

  protected elegirSigno(signo: 1 | -1): void {
    this.signo.set(signo);
    this.valor.set(this.valorTipeado());
  }

  /**
   * Se guarda el texto **limpio de todo lo que no sea dígito** y no el número
   * parseado: si se guardara el número, borrar el campo entero lo dejaría en 0
   * y el binding escribiría un «0» de vuelta en la caja, y no habría forma de
   * vaciarla para tipear otra cosa.
   */
  protected escribir(crudo: string): void {
    this.texto.set(crudo.replace(/\D/g, '').slice(0, 6));
    this.valor.set(this.valorTipeado());
  }

  protected clasesBoton(signo: 1 | -1): string {
    const base =
      'px-3 py-2 text-sm font-semibold transition focus-visible:ring-2 ' +
      'focus-visible:ring-marca-400 focus-visible:outline-none';

    if (this.signo() !== signo) {
      return `${base} text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800`;
    }

    // El elegido se pinta por lo que hace, no con el color de marca: sumar y
    // restar puntos no son la misma acción con distinto signo.
    return signo === 1
      ? `${base} bg-emerald-600 text-white`
      : `${base} bg-red-600 text-white`;
  }
}
