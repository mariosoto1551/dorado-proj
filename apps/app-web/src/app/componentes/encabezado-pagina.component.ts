import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Encabezado estándar de página del área Tutor: título, subtítulo y slot de acción. */
@Component({
  selector: 'app-encabezado-pagina',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">{{ titulo() }}</h1>
        @if (subtitulo()) {
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ subtitulo() }}</p>
        }
      </div>
      <div class="shrink-0">
        <ng-content />
      </div>
    </div>
  `,
})
export class EncabezadoPaginaComponent {
  readonly titulo = input.required<string>();

  readonly subtitulo = input<string>('');
}
