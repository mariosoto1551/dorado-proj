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
import { forkJoin } from 'rxjs';

import type { PuntajeUsuarioDto, UsuarioDto } from '@dorado/shared-types';
import { EstadoSeccionBadgeComponent, ZonaBadgeComponent } from '@dorado/shared-ui';

import { IconoComponent } from '../../componentes/icono.component';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { ScoringApiService } from '../../core/api/scoring-api.service';
import { SessionApiService } from '../../core/api/session-api.service';
import type { SeccionConSesionesResponse } from '../../core/api/api.types';
import { GuiaSetupService } from '../../core/guia/guia-setup.service';

interface FilaRanking extends PuntajeUsuarioDto {
  nombre: string;
  posicion: number;
}

/** Resumen del Grupo (fase-10): estado de la Sección actual + ranking en vivo. */
@Component({
  selector: 'app-resumen-grupo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EstadoSeccionBadgeComponent, ZonaBadgeComponent, IconoComponent],
  template: `
    <section class="mx-auto max-w-4xl px-4 py-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">Resumen del grupo</h1>
        @if (seccion(); as s) {
          <ui-estado-seccion-badge [estado]="s.estado" />
        }
      </div>

      <!-- Banner de primeros pasos: aparece hasta terminar de configurar el grupo -->
      @if (guia.cargado() && !guia.completa()) {
        <a
          [routerLink]="['/grupos', grupoId(), 'guia']"
          class="mt-4 flex items-center gap-4 rounded-2xl border border-marca-200 bg-marca-50 p-4 transition hover:bg-marca-100 dark:border-marca-900/60 dark:bg-marca-900/20 dark:hover:bg-marca-900/30"
        >
          <span class="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-gradient-to-br from-marca-500 to-marca-700 text-white shadow-sm">
            <span class="h-6 w-6"><app-icono nombre="chart" /></span>
          </span>
          <div class="min-w-0 flex-1">
            <p class="font-bold text-slate-900 dark:text-white">Terminá de configurar tu grupo</p>
            <p class="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              Vas {{ guia.completados() }} de {{ guia.totalPasos }} pasos. Seguí la guía para dejarlo listo.
            </p>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-marca-200/70 dark:bg-marca-900/50">
              <div
                class="h-full rounded-full bg-marca-600 transition-all duration-700"
                [style.width.%]="(guia.completados() / guia.totalPasos) * 100"
              ></div>
            </div>
          </div>
          <span class="hidden flex-none text-marca-600 dark:text-marca-400 sm:block">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </span>
        </a>
      }

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (!seccion()) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p class="text-sm text-slate-500 dark:text-slate-400">
            No hay una Sección activa todavía. Configurá la sesión e iniciá la primera semana.
          </p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <a
              [routerLink]="['/grupos', grupoId(), 'configuracion-sesion']"
              class="rounded-lg bg-marca-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-marca-700"
            >
              Configurar sesión
            </a>
            <a
              [routerLink]="['/grupos', grupoId(), 'secciones', 'actual']"
              class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Panel de la semana
            </a>
          </div>
        </div>
      } @else {
        <!-- Sección activa -->
        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p class="text-xs font-medium text-slate-400 dark:text-slate-500">Sección</p>
            <p class="mt-1 text-2xl font-bold text-slate-900 dark:text-white">#{{ seccion()!.numero }}</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p class="text-xs font-medium text-slate-400 dark:text-slate-500">Sesiones</p>
            <p class="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{{ seccion()!.sesiones.length }}</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p class="text-xs font-medium text-slate-400 dark:text-slate-500">Participantes</p>
            <p class="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{{ ranking().length }}</p>
          </div>
        </div>

        <!-- Ranking -->
        <div class="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h2 class="text-sm font-bold text-slate-900 dark:text-white">
              Ranking {{ seccion()!.estado === 'ABIERTA' ? '(preview)' : '(definitivo)' }}
            </h2>
            @if (seccion()!.estado !== 'ABIERTA') {
              <a
                [routerLink]="['/grupos', grupoId(), 'secciones', seccion()!.id, 'evaluacion']"
                class="text-xs font-semibold text-marca-600 hover:text-marca-700 dark:text-marca-400 dark:hover:text-marca-300"
              >
                Ir a evaluación →
              </a>
            }
          </div>

          @if (ranking().length === 0) {
            <p class="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Sin participantes aún.</p>
          } @else {
            <ul class="divide-y divide-slate-50 dark:divide-slate-800">
              @for (fila of ranking(); track fila.usuarioId) {
                <li class="flex items-center gap-3 px-4 py-3" [class.opacity-50]="fila.descalificado">
                  <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    [class]="fila.posicion <= 3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
                  >
                    {{ fila.posicion }}
                  </span>
                  <span class="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">
                    {{ fila.nombre }}
                    @if (fila.descalificado) {
                      <span class="ml-1 text-xs font-normal text-red-500 dark:text-red-400">(descalificado)</span>
                    }
                  </span>
                  <ui-zona-badge [zona]="fila.zona" tamano="sm" />
                  <span class="w-14 text-right text-sm font-bold text-slate-900 dark:text-white">{{ fila.puntajeTotal }}</span>
                </li>
              }
            </ul>
          }
        </div>
      }
    </section>
  `,
})
export class ResumenGrupoPage {
  readonly grupoId = input.required<string>();

  private readonly session = inject(SessionApiService);

  private readonly scoring = inject(ScoringApiService);

  private readonly identity = inject(IdentityApiService);

  protected readonly guia = inject(GuiaSetupService);

  protected readonly cargando = signal(true);

  protected readonly seccion = signal<SeccionConSesionesResponse | null>(null);

  private readonly puntajes = signal<PuntajeUsuarioDto[]>([]);

  private readonly usuarios = signal<UsuarioDto[]>([]);

  protected readonly ranking = computed<FilaRanking[]>(() => {
    const mapa = new Map(this.usuarios().map((u) => [u.id, u.nombre]));

    return [...this.puntajes()]
      .sort((a, b) => b.puntajeTotal - a.puntajeTotal)
      .map((p, i) => ({
        ...p,
        nombre: mapa.get(p.usuarioId) ?? 'Usuario',
        posicion: i + 1,
      }));
  });

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
      // Refresco forzado del progreso de setup: el Resumen es el "home" del
      // grupo, punto natural para reevaluar qué falta configurar.
      this.guia.cargar(g, true);
    });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);
    this.seccion.set(null);
    this.puntajes.set([]);

    forkJoin({
      seccion: this.session.seccionActual(grupoId),
      usuarios: this.identity.listarUsuarios(grupoId),
    }).subscribe({
      next: ({ seccion, usuarios }) => {
        this.usuarios.set(usuarios);
        this.seccion.set(seccion);

        if (seccion) {
          this.scoring.puntajesDeGrupo(grupoId, seccion.id).subscribe({
            next: (p) => {
              this.puntajes.set(p);
              this.cargando.set(false);
            },
            error: () => this.cargando.set(false),
          });
        } else {
          this.cargando.set(false);
        }
      },
      error: () => this.cargando.set(false),
    });
  }
}
