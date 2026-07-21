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

import { IdentityApiService } from '../../core/api/identity-api.service';
import { ScoringApiService } from '../../core/api/scoring-api.service';
import { SessionApiService } from '../../core/api/session-api.service';
import type { SeccionConSesionesResponse } from '../../core/api/api.types';

interface FilaRanking extends PuntajeUsuarioDto {
  nombre: string;
  posicion: number;
}

/** Resumen del Grupo (fase-10): estado de la Sección actual + ranking en vivo. */
@Component({
  selector: 'app-resumen-grupo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EstadoSeccionBadgeComponent, ZonaBadgeComponent],
  template: `
    <section class="mx-auto max-w-4xl px-4 py-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Resumen del grupo</h1>
        @if (seccion(); as s) {
          <ui-estado-seccion-badge [estado]="s.estado" />
        }
      </div>

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400">Cargando…</p>
      } @else if (!seccion()) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p class="text-sm text-slate-500">
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
              class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Panel de la semana
            </a>
          </div>
        </div>
      } @else {
        <!-- Sección activa -->
        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium text-slate-400">Sección</p>
            <p class="mt-1 text-2xl font-bold text-slate-900">#{{ seccion()!.numero }}</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium text-slate-400">Sesiones</p>
            <p class="mt-1 text-2xl font-bold text-slate-900">{{ seccion()!.sesiones.length }}</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium text-slate-400">Participantes</p>
            <p class="mt-1 text-2xl font-bold text-slate-900">{{ ranking().length }}</p>
          </div>
        </div>

        <!-- Ranking -->
        <div class="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 class="text-sm font-bold text-slate-900">
              Ranking {{ seccion()!.estado === 'ABIERTA' ? '(preview)' : '(definitivo)' }}
            </h2>
            @if (seccion()!.estado !== 'ABIERTA') {
              <a
                [routerLink]="['/grupos', grupoId(), 'secciones', seccion()!.id, 'evaluacion']"
                class="text-xs font-semibold text-marca-600 hover:text-marca-700"
              >
                Ir a evaluación →
              </a>
            }
          </div>

          @if (ranking().length === 0) {
            <p class="px-4 py-8 text-center text-sm text-slate-400">Sin participantes aún.</p>
          } @else {
            <ul class="divide-y divide-slate-50">
              @for (fila of ranking(); track fila.usuarioId) {
                <li class="flex items-center gap-3 px-4 py-3" [class.opacity-50]="fila.descalificado">
                  <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    [class]="fila.posicion <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'"
                  >
                    {{ fila.posicion }}
                  </span>
                  <span class="min-w-0 flex-1 truncate font-medium text-slate-800">
                    {{ fila.nombre }}
                    @if (fila.descalificado) {
                      <span class="ml-1 text-xs font-normal text-red-500">(descalificado)</span>
                    }
                  </span>
                  <ui-zona-badge [zona]="fila.zona" tamano="sm" />
                  <span class="w-14 text-right text-sm font-bold text-slate-900">{{ fila.puntajeTotal }}</span>
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
