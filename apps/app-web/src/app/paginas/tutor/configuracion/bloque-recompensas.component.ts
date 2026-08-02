import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import type { ConfiguracionRecompensasGrupoDto, UmbralZonaDto } from '@dorado/shared-types';
import { ZonaBadgeComponent } from '@dorado/shared-ui';

import { RewardsApiService } from '../../../core/api/rewards-api.service';
import { ScoringApiService } from '../../../core/api/scoring-api.service';
import { ModoRecompensasComponent } from '../recompensas/modo-recompensas.component';

/**
 * «Qué se gana» — segundo bloque del hub (fase-14-23 T3).
 *
 * Trae el interruptor de modo de recompensas (#22), que hasta ahora vivía como
 * tarjeta arriba del catálogo en `/recompensas`, y el estado de las Zonas, que
 * sigue siendo pantalla propia por ser un CRUD con modal (decisión 1).
 *
 * El interruptor se reusa tal cual: `ModoRecompensasComponent` ya era un
 * componente controlado con su propio diálogo de confirmación (el cambio de
 * modo tiene consecuencias sobre la semana en curso), así que mudarlo fue
 * moverlo de padre.
 */
@Component({
  selector: 'app-bloque-recompensas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ModoRecompensasComponent, ZonaBadgeComponent],
  template: `
    <section>
      @if (config(); as c) {
        <app-modo-recompensas
          [grupoId]="grupoId()"
          [config]="c"
          (cambiado)="config.set($event)"
          class="block"
        />
      } @else {
        <p class="py-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      }

      <!-- Zonas (fase-10 + puntos iniciales de fase-14): pantalla propia -->
      <a
        [routerLink]="['/grupos', grupoId(), 'umbrales']"
        class="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4 transition dark:border-slate-800"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-semibold text-slate-900 dark:text-white">Zonas</span>
          <span class="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
            {{ resumenZonas() }}
          </span>
          @if (umbrales().length > 0) {
            <span class="mt-1.5 flex flex-wrap gap-1">
              @for (u of umbrales(); track u.id) {
                <ui-zona-badge [zona]="u" tamano="sm" />
              }
            </span>
          }
        </span>
        <span class="shrink-0 text-sm font-semibold text-marca-600 dark:text-marca-300">
          Editar →
        </span>
      </a>
    </section>
  `,
})
export class BloqueRecompensasComponent {
  readonly grupoId = input.required<string>();

  private readonly rewards = inject(RewardsApiService);

  private readonly scoring = inject(ScoringApiService);

  protected readonly config = signal<ConfiguracionRecompensasGrupoDto | null>(null);

  protected readonly umbrales = signal<UmbralZonaDto[]>([]);

  private readonly puntosIniciales = signal<number | null>(null);

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  protected resumenZonas(): string {
    const n = this.umbrales().length;
    const base = this.puntosIniciales();
    const arranque = base === null ? '' : ` · arrancan con ${base} punto${base === 1 ? '' : 's'}`;

    if (n === 0) {
      return 'Todavía no hay zonas definidas — sin zonas no se puede ganar nada.';
    }

    return `${n} zona${n === 1 ? '' : 's'}${arranque}`;
  }

  private cargar(grupoId: string): void {
    this.config.set(null);

    this.rewards.configuracion(grupoId).subscribe({
      next: (c) => this.config.set(c),
      error: () => undefined,
    });

    this.scoring.listarUmbrales(grupoId).subscribe({
      next: (u) => this.umbrales.set([...u].sort((a, b) => a.orden - b.orden)),
      error: () => undefined,
    });

    this.scoring.obtenerConfiguracion(grupoId).subscribe({
      next: (c) => this.puntosIniciales.set(c.puntosIniciales),
      error: () => undefined,
    });
  }
}
