import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

export type AnchoModal = 'sm' | 'md' | 'lg';

/** Contador de instancias, para que `aria-labelledby` apunte a un id único. */
let idSecuencia = 0;

/**
 * Hoja/modal del área de gestión (fase-14-23 T2).
 *
 * Reemplaza las 15 copias a mano que había en `paginas/tutor`: fondo
 * `fixed inset-0`, botón de cierre invisible, panel `rounded-t-2xl` en móvil y
 * `rounded-2xl` en escritorio, `animate-slide-up`, título y botonera. Once de
 * esas copias tenían las clases del panel idénticas carácter por carácter.
 *
 * Suma lo que ninguna de las copias tenía: `role="dialog"`, `aria-modal`,
 * `aria-labelledby`, cierre con Escape y foco llevado al panel al abrir.
 *
 * El FORMULARIO lo pone la página adentro, no el modal. Es lo que deja el
 * submit en manos del formulario, que es el contrato que salió de la T1
 * (un formulario, un botón, cancelar cancela).
 *
 * IMPORTANTE — el `@if` de adentro no es decorativo: el contenido PROYECTADO lo
 * crea la página, no el modal, así que el `@if (abierto())` interno de este
 * componente no lo destruye al cerrar. Sin el `@if` de la página, todo estado
 * de un componente hijo (una casilla tildada, una secuencia a medio armar)
 * SOBREVIVE al cierre y reaparece la próxima vez que se abre. Antes de la T2
 * cada modal vivía dentro de su propio `@if`, que sí lo destruía; el `@if`
 * interno conserva ese comportamiento exacto.
 *
 * ```html
 * <ui-modal [abierto]="editor() !== null" titulo="Nuevo rol" (cerrar)="cerrar()">
 *   @if (editor()) {
 *     <form (submit)="guardar($event)">
 *       …
 *       <div class="botonera">…</div>
 *     </form>
 *   }
 * </ui-modal>
 * ```
 */
@Component({
  selector: 'ui-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    @if (abierto()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <button
          type="button"
          aria-label="Cerrar"
          (click)="cerrar.emit()"
          class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"
        ></button>
        <div
          #panel
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="titulo() ? idTitulo : null"
          [attr.aria-label]="titulo() ? null : etiquetaSinTitulo()"
          tabindex="-1"
          class="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up focus:outline-none dark:bg-slate-900 sm:rounded-2xl"
          [class]="claseAncho()"
        >
          @if (titulo()) {
            <h2 [id]="idTitulo" class="text-lg font-bold text-slate-900 dark:text-white">
              {{ titulo() }}
            </h2>
          }

          @if (subtitulo()) {
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ subtitulo() }}</p>
          }

          <ng-content />
        </div>
      </div>
    }
  `,
})
export class ModalComponent {
  readonly abierto = input<boolean>(false);

  readonly titulo = input<string>('');

  readonly subtitulo = input<string>('');

  readonly ancho = input<AnchoModal>('md');

  /** Etiqueta accesible para los modales sin título visible (raros). */
  readonly etiquetaSinTitulo = input<string>('Diálogo');

  /** Escape, click en el fondo o el botón de cierre. La página decide qué hacer. */
  readonly cerrar = output<void>();

  protected readonly idTitulo = `ui-modal-titulo-${(idSecuencia += 1)}`;

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly claseAncho = computed(() => {
    switch (this.ancho()) {
      case 'sm':
        return 'max-w-sm';
      case 'md':
        return 'max-w-md';
      case 'lg':
        return 'max-w-2xl';
    }
  });

  constructor() {
    // Al abrir, el foco entra al panel: sin esto queda en el botón que abrió el
    // modal, atrás del fondo, y quien navega con teclado sigue tabulando la
    // pantalla de abajo.
    effect(() => {
      if (!this.abierto()) {
        return;
      }

      queueMicrotask(() => {
        const panel = this.panel()?.nativeElement;

        if (!panel) {
          return;
        }

        // Si el modal tiene un campo, gana el campo; si no, el panel.
        const primerCampo = panel.querySelector<HTMLElement>(
          'input:not([type="hidden"]), select, textarea'
        );

        (primerCampo ?? panel).focus();
      });
    });
  }

  protected onEscape(): void {
    if (this.abierto()) {
      this.cerrar.emit();
    }
  }
}
