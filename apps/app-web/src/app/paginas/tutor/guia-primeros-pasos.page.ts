import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { IconoComponent } from '../../componentes/icono.component';
import { PASOS_GUIA, type PasoGuia } from '../../core/guia/guia-pasos';
import { EstadoPasos, GuiaSetupService } from '../../core/guia/guia-setup.service';

/**
 * Guía de primeros pasos (fase-14): checklist con progreso real que arma un
 * grupo nuevo paso a paso. Cada paso se marca solo cuando el dato existe
 * (GuiaSetupService). El paso de "ritmo de sesión" es opcional y no cuenta.
 */
@Component({
  selector: 'app-guia-primeros-pasos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent],
  template: `
    <section class="mx-auto max-w-2xl px-4 py-6">
      <div class="flex items-center gap-3">
        <span class="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-gradient-to-br from-marca-500 to-marca-700 text-white shadow-sm">
          <span class="h-6 w-6"><app-icono nombre="chart" /></span>
        </span>
        <div>
          <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">Primeros pasos</h1>
          <p class="text-sm text-slate-500 dark:text-slate-400">Armá tu sistema de puntos en unos minutos.</p>
        </div>
      </div>

      @if (guia.completa()) {
        <!-- Estado completo: celebración -->
        <div class="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
          <div class="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <span class="h-8 w-8"><app-icono nombre="trophy" /></span>
          </div>
          <h2 class="mt-4 text-xl font-bold text-slate-900 dark:text-white">¡Todo listo! 🎉</h2>
          <p class="mx-auto mt-2 max-w-sm text-sm text-slate-600 dark:text-slate-300">
            Tu grupo ya está configurado y en marcha. Podés seguir el día a día desde el resumen.
          </p>
          <a [routerLink]="['/grupos', grupoId()]" class="btn-primario mt-6">
            Ir al resumen
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
        </div>
      } @else {
        <!-- Barra de progreso -->
        <div class="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="flex items-center justify-between text-sm">
            <span class="font-semibold text-slate-700 dark:text-slate-200">Tu progreso</span>
            <span class="font-bold tabular-nums text-marca-600 dark:text-marca-400">
              {{ guia.completados() }} de {{ guia.totalPasos }}
            </span>
          </div>
          <div class="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              class="h-full rounded-full bg-marca-600 transition-all duration-700"
              [style.width.%]="porcentaje()"
            ></div>
          </div>
        </div>

        <!-- Checklist (el paso opcional va intercalado, sin número) -->
        <ol class="mt-4 space-y-2.5">
          @for (paso of pasos; track paso.clave) {
            @if (paso.opcional) {
              <li class="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <span class="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <span class="h-5 w-5"><app-icono nombre="cog" /></span>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-slate-900 dark:text-white">
                    {{ paso.titulo }}
                    <span class="ml-1 text-xs font-medium text-slate-400 dark:text-slate-500">(opcional)</span>
                  </p>
                  <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{{ paso.descripcion }}</p>
                </div>
                <a
                  [routerLink]="['/grupos', grupoId(), ...paso.segmentos]"
                  class="flex-none rounded-full px-4 py-2 text-sm font-semibold text-marca-600 transition hover:text-marca-700 dark:text-marca-400 dark:hover:text-marca-300"
                >
                  {{ paso.cta }}
                </a>
              </li>
            } @else {
              <li
                class="flex items-center gap-3 rounded-2xl border p-4 shadow-sm transition"
                [class]="hecho(paso) ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'"
              >
                <span
                  class="flex h-9 w-9 flex-none items-center justify-center rounded-full text-sm font-bold"
                  [class]="hecho(paso) ? 'bg-emerald-500 text-white' : 'bg-marca-100 text-marca-700 dark:bg-marca-900/40 dark:text-marca-300'"
                >
                  @if (hecho(paso)) {
                    <span class="h-5 w-5"><app-icono nombre="check" /></span>
                  } @else {
                    {{ paso.numero }}
                  }
                </span>

                <div class="min-w-0 flex-1">
                  <p
                    class="font-semibold text-slate-900 dark:text-white"
                    [class.line-through]="hecho(paso)"
                    [class.text-slate-400]="hecho(paso)"
                    [class.dark:text-slate-500]="hecho(paso)"
                  >
                    {{ paso.titulo }}
                  </p>
                  <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{{ paso.descripcion }}</p>
                </div>

                <a
                  [routerLink]="['/grupos', grupoId(), ...paso.segmentos]"
                  class="flex-none rounded-full px-4 py-2 text-sm font-semibold transition"
                  [class]="hecho(paso) ? 'text-marca-600 hover:text-marca-700 dark:text-marca-400 dark:hover:text-marca-300' : 'bg-marca-600 text-white hover:bg-marca-700'"
                >
                  {{ hecho(paso) ? 'Ver' : paso.cta }}
                </a>
              </li>
            }
          }
        </ol>
      }
    </section>
  `,
})
export class GuiaPrimerosPasosPage {
  readonly grupoId = input.required<string>();

  protected readonly guia = inject(GuiaSetupService);

  protected readonly pasos = PASOS_GUIA;

  protected readonly porcentaje = computed(() =>
    Math.round((this.guia.completados() / this.guia.totalPasos) * 100)
  );

  constructor() {
    // Refresco forzado al entrar: el tutor suele venir de crear algo.
    effect(() => {
      const g = this.grupoId();
      this.guia.cargar(g, true);
    });
  }

  protected hecho(paso: PasoGuia): boolean {
    if (paso.opcional) {
      return false;
    }

    return this.guia.estado()[paso.clave as keyof EstadoPasos];
  }
}
