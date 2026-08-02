import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { ModoRecompensas, type ConfiguracionRecompensasGrupoDto } from '@dorado/shared-types';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { IconoComponent } from '../../componentes/icono.component';
import { RewardsApiService } from '../../core/api/rewards-api.service';
import { BilleterasComponent } from './recompensas/billeteras.component';
import { BolsasComponent } from './recompensas/bolsas.component';
import { CatalogoItemsComponent } from './recompensas/catalogo-items.component';
import { ProductosComponent } from './recompensas/productos.component';
import { RendimientosComponent } from './recompensas/rendimientos.component';

type Pestana = 'CATALOGO' | 'RENDIMIENTO' | 'BOLSAS' | 'TIENDA' | 'BILLETERAS';

/**
 * Recompensas del grupo (fase-10, reorganizada por fase-14-22).
 *
 * El interruptor de modo va ARRIBA de las pestañas porque decide qué pestañas
 * existen: en `DIRECTO` solo el catálogo —o sea, exactamente la pantalla de
 * antes—, y en `TIENDA` se abren rendimiento, bolsas, tienda y billeteras.
 *
 * La entrega NO vive acá: es la única acción diaria y tiene su propia entrada
 * en el menú, con contador.
 */
@Component({
  selector: 'app-recompensas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    EncabezadoPaginaComponent,
    IconoComponent,
    CatalogoItemsComponent,
    RendimientosComponent,
    BolsasComponent,
    ProductosComponent,
    BilleterasComponent,
  ],
  template: `
    <section class="mx-auto max-w-4xl px-4 py-6">
      <app-encabezado-pagina
        titulo="Recompensas"
        subtitulo="Qué se gana y cómo se consigue."
      />

      @if (config(); as c) {
        <!-- fase-14-23 T3: el interruptor de modo se mudó al hub de
             configuración; acá queda su estado, que es lo que cambia el
             significado de todo el catálogo de abajo. -->
        <a
          [routerLink]="['/grupos', grupoId(), 'configuracion']"
          class="mt-4 flex items-center gap-2 text-xs text-slate-500 transition hover:text-marca-600 dark:text-slate-400 dark:hover:text-marca-300"
        >
          <span class="h-3.5 w-3.5 shrink-0"><app-icono nombre="cog" /></span>
          <span class="min-w-0 truncate">
            Modo: {{ c.modo === 'TIENDA' ? 'Tienda' : 'Premio directo' }}
            @if (c.modoPendiente) {
              · cambia a {{ c.modoPendiente }} la semana que viene
            }
          </span>
          <span class="shrink-0 font-semibold">Ajustes →</span>
        </a>

        @if (pestanas().length > 1) {
          <nav class="mt-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
            @for (p of pestanas(); track p.clave) {
              <button
                type="button"
                (click)="pestana.set(p.clave)"
                [class]="
                  pestana() === p.clave
                    ? 'shrink-0 border-b-2 border-marca-600 px-3.5 py-2.5 text-sm font-semibold text-marca-700 transition dark:border-marca-400 dark:text-marca-300'
                    : 'shrink-0 border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                "
              >
                {{ p.etiqueta }}
              </button>
            }
          </nav>
        }

        <div class="mt-5 animate-fade-in">
          @switch (pestana()) {
            @case ('CATALOGO') {
              <app-catalogo-items [grupoId]="grupoId()" [modo]="c.modo" />
            }
            @case ('RENDIMIENTO') {
              <app-rendimientos-zona [grupoId]="grupoId()" />
            }
            @case ('BOLSAS') {
              <app-bolsas [grupoId]="grupoId()" />
            }
            @case ('TIENDA') {
              <app-productos-tienda [grupoId]="grupoId()" />
            }
            @case ('BILLETERAS') {
              <app-billeteras [grupoId]="grupoId()" />
            }
          }
        </div>
      } @else {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      }
    </section>
  `,
})
export class RecompensasPage {
  readonly grupoId = input.required<string>();

  private readonly api = inject(RewardsApiService);

  protected readonly config = signal<ConfiguracionRecompensasGrupoDto | null>(null);

  protected readonly pestana = signal<Pestana>('CATALOGO');

  protected readonly pestanas = computed<{ clave: Pestana; etiqueta: string }[]>(() => {
    const base: { clave: Pestana; etiqueta: string }[] = [
      { clave: 'CATALOGO', etiqueta: 'Catálogo' },
    ];

    if (this.config()?.modo !== ModoRecompensas.TIENDA) {
      return base;
    }

    return [
      ...base,
      { clave: 'RENDIMIENTO', etiqueta: 'Rendimiento' },
      { clave: 'BOLSAS', etiqueta: 'Bolsas' },
      { clave: 'TIENDA', etiqueta: 'Tienda' },
      { clave: 'BILLETERAS', etiqueta: 'Billeteras' },
    ];
  });

  constructor() {
    effect(() => {
      const grupoId = this.grupoId();

      this.api.configuracion(grupoId).subscribe({
        next: (config) => this.config.set(config),
        error: () =>
          // Sin configuración explícita el grupo es DIRECTO (retro-compatible).
          this.config.set({
            grupoId,
            modo: ModoRecompensas.DIRECTO,
            modoPendiente: null,
            nombreMoneda: 'monedas',
            iconoMoneda: '🪙',
          }),
      });
    });

    // Al volver a DIRECTO, una pestaña que ya no existe dejaría la vista vacía.
    effect(() => {
      const disponibles = this.pestanas().map((p) => p.clave);

      if (!disponibles.includes(this.pestana())) {
        this.pestana.set('CATALOGO');
      }
    });
  }
}
