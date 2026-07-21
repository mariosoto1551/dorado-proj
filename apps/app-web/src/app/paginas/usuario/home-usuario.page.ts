import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { forkJoin, of } from 'rxjs';

import type { ActividadDto, PuntajeUsuarioDto } from '@dorado/shared-types';
import { ZonaBadgeComponent } from '@dorado/shared-ui';

import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import type { SeccionConSesionesResponse } from '../../core/api/api.types';
import { mensajeDeError } from '../../core/api/errores';
import { ScoringApiService } from '../../core/api/scoring-api.service';
import { SessionApiService } from '../../core/api/session-api.service';
import { AuthService } from '../../core/auth/auth.service';

interface CronometroActivo {
  actividadId: string;
  venceEn: number;
}

/** Home del USUARIO (fase-10): actividades de la sesión actual + su zona/puntaje. */
@Component({
  selector: 'app-home-usuario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, ZonaBadgeComponent],
  template: `
    <section class="mx-auto max-w-xl px-4 py-5">
      <!-- Saludo + zona -->
      <div class="rounded-3xl bg-linear-to-br from-marca-600 to-marca-800 p-5 text-white shadow-lg">
        <p class="text-sm text-marca-100">¡Hola,</p>
        <h1 class="text-2xl font-extrabold">{{ auth.nombreMostrable() }}! 👋</h1>

        @if (puntaje(); as p) {
          <div class="mt-4 flex items-end justify-between">
            <div>
              <p class="text-xs text-marca-200">Tu puntaje</p>
              <p class="text-4xl font-black tabular-nums">{{ p.puntajeTotal }}</p>
            </div>
            @if (p.zona) {
              <ui-zona-badge [zona]="p.zona" tamano="lg" />
            }
          </div>
        }
      </div>

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400">Cargando…</p>
      } @else if (!seccion()) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Todavía no hay una semana activa. Volvé más tarde. 🌱
        </div>
      } @else if (!haySesionAbierta()) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          La sesión está cerrada por ahora. Pronto se abre la próxima. ⏳
        </div>
      } @else {
        <h2 class="mt-6 mb-3 text-sm font-bold text-slate-500 uppercase">Actividades de hoy</h2>
        <ul class="space-y-2.5">
          @for (a of actividades(); track a.id) {
            <li
              class="flex items-center gap-3 rounded-2xl border-2 bg-white p-4 shadow-sm transition"
              [class]="completadas().has(a.id) ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100'"
            >
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-slate-900" [class.line-through]="completadas().has(a.id)">
                  {{ a.nombre }}
                </p>
                <p class="mt-0.5 text-xs text-slate-500">
                  <span class="font-bold text-marca-600">+{{ a.valorPuntos }} pts</span>
                  @if (a.tipoLimiteTiempo === 'DEADLINE') {
                    · hasta {{ a.deadlineHora }}
                  } @else if (a.tipoLimiteTiempo === 'CRONOMETRO') {
                    · {{ a.duracionCronometroMinutos }} min
                  }
                </p>
              </div>

              @if (completadas().has(a.id)) {
                <span class="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white animate-pop">
                  <span class="h-5 w-5"><app-icono nombre="check" /></span>
                </span>
              } @else if (a.tipoLimiteTiempo === 'CRONOMETRO' && !cronometroDe(a.id)) {
                <button
                  type="button"
                  (click)="iniciarCronometro(a)"
                  [disabled]="procesando()"
                  class="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                >
                  <span class="h-4 w-4"><app-icono nombre="clock" /></span>
                  Iniciar
                </button>
              } @else {
                <button
                  type="button"
                  (click)="completar(a)"
                  [disabled]="procesando()"
                  class="shrink-0 rounded-full bg-marca-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
                >
                  @if (cronometroDe(a.id)) {
                    Listo
                  } @else {
                    Completar
                  }
                </button>
              }
            </li>
          } @empty {
            <li class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No hay actividades activas.
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class HomeUsuarioPage {
  protected readonly auth = inject(AuthService);

  private readonly session = inject(SessionApiService);

  private readonly activity = inject(ActivityApiService);

  private readonly scoring = inject(ScoringApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly procesando = signal(false);

  protected readonly seccion = signal<SeccionConSesionesResponse | null>(null);

  protected readonly actividades = signal<ActividadDto[]>([]);

  protected readonly puntaje = signal<PuntajeUsuarioDto | null>(null);

  /** Estado local optimista: qué actividades completó en esta sesión (ver deuda técnica fase-10). */
  protected readonly completadas = signal<Set<string>>(new Set());

  private readonly cronometros = signal<CronometroActivo[]>([]);

  protected readonly haySesionAbierta = computed(
    () => this.seccion()?.sesiones.some((s) => s.estado === 'ABIERTA') ?? false
  );

  constructor() {
    this.cargar();
  }

  protected cronometroDe(actividadId: string): CronometroActivo | undefined {
    return this.cronometros().find((c) => c.actividadId === actividadId);
  }

  protected iniciarCronometro(a: ActividadDto): void {
    this.procesando.set(true);
    this.activity.iniciarCronometro(a.id).subscribe({
      next: (res) => {
        this.cronometros.update((l) => [
          ...l,
          { actividadId: a.id, venceEn: new Date(res.venceEn).getTime() },
        ]);
        this.procesando.set(false);
        this.toasts.info('¡Cronómetro en marcha! Tocá «Listo» al terminar.');
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  protected completar(a: ActividadDto): void {
    this.procesando.set(true);
    this.activity.completarActividad(a.id).subscribe({
      next: () => {
        this.completadas.update((s) => new Set(s).add(a.id));
        this.cronometros.update((l) => l.filter((c) => c.actividadId !== a.id));
        this.procesando.set(false);
        this.toasts.exito(`¡+${a.valorPuntos} puntos! 🎉`);
        this.refrescarPuntaje();
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  private cargar(): void {
    const grupoId = this.auth.grupoUsuario();
    const usuarioId = this.auth.principalId();

    if (!grupoId || !usuarioId) {
      this.cargando.set(false);

      return;
    }

    this.cargando.set(true);
    this.session.seccionActual(grupoId).subscribe({
      next: (seccion) => {
        this.seccion.set(seccion);

        forkJoin({
          actividades: this.activity.listarActividades(grupoId),
          puntaje: seccion ? this.scoring.puntajeDeUsuario(usuarioId, seccion.id) : of(null),
        }).subscribe({
          next: ({ actividades, puntaje }) => {
            this.actividades.set(actividades);
            this.puntaje.set(puntaje);
            this.cargando.set(false);
          },
          error: () => this.cargando.set(false),
        });
      },
      error: () => this.cargando.set(false),
    });
  }

  private refrescarPuntaje(): void {
    const seccion = this.seccion();
    const usuarioId = this.auth.principalId();

    if (!seccion || !usuarioId) {
      return;
    }

    this.scoring.puntajeDeUsuario(usuarioId, seccion.id).subscribe({
      next: (p) => this.puntaje.set(p),
      error: () => undefined,
    });
  }
}
