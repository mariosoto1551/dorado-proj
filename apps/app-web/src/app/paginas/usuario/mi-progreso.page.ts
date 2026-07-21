import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { forkJoin, of } from 'rxjs';

import {
  EstadoSeccion,
  type PuntajeUsuarioDto,
  type SeccionDto,
  type UmbralZonaDto,
} from '@dorado/shared-types';
import { ZonaBadgeComponent } from '@dorado/shared-ui';

import { ScoringApiService } from '../../core/api/scoring-api.service';
import { SessionApiService } from '../../core/api/session-api.service';
import { AuthService } from '../../core/auth/auth.service';

interface SeccionHistorial {
  seccion: SeccionDto;
  puntaje: PuntajeUsuarioDto;
}

/** Mi progreso (fase-10): puntaje/zona actuales con barra hacia la próxima + historial. */
@Component({
  selector: 'app-mi-progreso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ZonaBadgeComponent],
  template: `
    <section class="mx-auto max-w-xl px-4 py-5">
      <h1 class="text-xl font-bold tracking-tight text-slate-900">Mi progreso</h1>

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400">Cargando…</p>
      } @else {
        @if (actual(); as p) {
          <div class="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-slate-400">Semana actual</p>
                <p class="text-4xl font-black tabular-nums text-slate-900">{{ p.puntajeTotal }}</p>
              </div>
              <ui-zona-badge [zona]="p.zona" tamano="lg" />
            </div>

            @if (progreso(); as prog) {
              <div class="mt-5">
                <div class="mb-1.5 flex justify-between text-xs font-medium text-slate-500">
                  <span>{{ p.zona?.nombreZona }}</span>
                  <span>{{ prog.faltan }} pts para {{ prog.siguienteNombre }}</span>
                </div>
                <div class="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    class="h-full rounded-full transition-all duration-700"
                    [style.width.%]="prog.porcentaje"
                    [style.background-color]="p.zona?.colorHex ?? '#6366f1'"
                  ></div>
                </div>
              </div>
            } @else if (p.zona) {
              <p class="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-700">
                🏆 ¡Estás en la zona más alta!
              </p>
            }
          </div>
        } @else {
          <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Todavía no hay una semana activa.
          </div>
        }

        <!-- Historial -->
        @if (historial().length > 0) {
          <h2 class="mt-8 mb-2 text-sm font-bold text-slate-500 uppercase">Semanas anteriores</h2>
          <ul class="space-y-2">
            @for (h of historial(); track h.seccion.id) {
              <li class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                  #{{ h.seccion.numero }}
                </span>
                <div class="flex-1">
                  <ui-zona-badge [zona]="h.puntaje.zona" tamano="sm" />
                </div>
                <span class="text-lg font-bold tabular-nums text-slate-900">{{ h.puntaje.puntajeTotal }}</span>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
})
export class MiProgresoPage {
  private readonly auth = inject(AuthService);

  private readonly session = inject(SessionApiService);

  private readonly scoring = inject(ScoringApiService);

  protected readonly cargando = signal(true);

  protected readonly actual = signal<PuntajeUsuarioDto | null>(null);

  protected readonly historial = signal<SeccionHistorial[]>([]);

  private readonly umbrales = signal<UmbralZonaDto[]>([]);

  /** Progreso hacia la próxima zona (null si ya está en la más alta o sin zona). */
  protected readonly progreso = computed(() => {
    const p = this.actual();
    const zona = p?.zona;

    if (!p || !zona) {
      return null;
    }

    const ordenadas = [...this.umbrales()].sort((a, b) => a.orden - b.orden);
    const siguiente = ordenadas.find((u) => u.orden === zona.orden + 1);

    if (!siguiente) {
      return null;
    }

    const faltan = Math.max(0, siguiente.puntosMin - p.puntajeTotal);
    const rango = siguiente.puntosMin - zona.puntosMin;
    const porcentaje = rango > 0 ? Math.min(100, ((p.puntajeTotal - zona.puntosMin) / rango) * 100) : 0;

    return { faltan, porcentaje, siguienteNombre: siguiente.nombreZona };
  });

  constructor() {
    this.cargar();
  }

  private cargar(): void {
    const grupoId = this.auth.grupoUsuario();
    const usuarioId = this.auth.principalId();

    if (!grupoId || !usuarioId) {
      this.cargando.set(false);

      return;
    }

    forkJoin({
      seccion: this.session.seccionActual(grupoId),
      umbrales: this.scoring.listarUmbrales(grupoId),
      cerradas: this.session.listarSecciones(grupoId, EstadoSeccion.CERRADA),
    }).subscribe({
      next: ({ seccion, umbrales, cerradas }) => {
        this.umbrales.set(umbrales);

        const actual$ = seccion
          ? this.scoring.puntajeDeUsuario(usuarioId, seccion.id)
          : of(null);

        const historial$ =
          cerradas.length > 0
            ? forkJoin(
                cerradas.map((s) =>
                  this.scoring.puntajeDeUsuario(usuarioId, s.id).pipe()
                )
              )
            : of([] as PuntajeUsuarioDto[]);

        forkJoin({ actual: actual$, puntajes: historial$ }).subscribe({
          next: ({ actual, puntajes }) => {
            this.actual.set(actual);
            this.historial.set(
              cerradas
                .map((seccionCerrada, i) => ({ seccion: seccionCerrada, puntaje: puntajes[i] }))
                .sort((a, b) => b.seccion.numero - a.seccion.numero)
            );
            this.cargando.set(false);
          },
          error: () => this.cargando.set(false),
        });
      },
      error: () => this.cargando.set(false),
    });
  }
}
