import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';

import {
  type ActividadDto,
  type MiEstadoActividadHoyDto,
  type MiEstadoHoyDto,
  ModoCreacionContenidoUsuario,
  OrigenActividad,
  type PuntajeUsuarioDto,
} from '@dorado/shared-types';
import { ZonaBadgeComponent } from '@dorado/shared-ui';

import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import type { SeccionConSesionesResponse } from '../../core/api/api.types';
import { mensajeDeError } from '../../core/api/errores';
import { ScoringApiService } from '../../core/api/scoring-api.service';
import { SessionApiService } from '../../core/api/session-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { describirDias } from '../../core/dias-semana';

interface CronometroActivo {
  actividadId: string;
  venceEn: number;
}

/**
 * Estado de un segmento de la barrita de repeticiones. `perdido` es fase-14-12:
 * un intento que el tutor quemó y que el integrante no recupera.
 */
type EstadoSegmento = 'hecho' | 'libre' | 'perdido';

/** Home del USUARIO (fase-10, estado real desde fase-14-08). */
@Component({
  selector: 'app-home-usuario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent, ZonaBadgeComponent],
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
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (!seccion()) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Todavía no hay una semana activa. Volvé más tarde. 🌱
        </div>
      } @else if (!haySesionAbierta()) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          La sesión está cerrada por ahora. Pronto se abre la próxima. ⏳
        </div>
      } @else {
        @for (bloque of bloques(); track bloque.titulo) {
        <div class="mt-6 mb-3 flex items-center justify-between gap-2">
          <h2 class="text-sm font-bold text-slate-500 uppercase dark:text-slate-400">{{ bloque.titulo }}</h2>
          @if (bloque.esPropio) {
            <a
              routerLink="/mis-actividades"
              class="flex items-center gap-1 rounded-full bg-marca-50 px-3 py-1.5 text-xs font-semibold text-marca-700 transition hover:bg-marca-100 dark:bg-marca-900/30 dark:text-marca-300 dark:hover:bg-marca-900/50"
            >
              <span class="h-3.5 w-3.5"><app-icono nombre="plus" /></span>
              Crear la mía
            </a>
          }
        </div>
        <ul class="space-y-2.5">
          @for (a of bloque.items; track a.id) {
            <li
              class="flex items-center gap-3 rounded-2xl border-2 bg-white p-4 shadow-sm transition dark:bg-slate-900"
              [class]="clasesTarjeta(a)"
              [class.opacity-60]="!disponibleHoy(a)"
            >
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-slate-900 dark:text-white" [class.line-through]="resaltado(a)">
                  {{ a.nombre }}
                </p>
                <!-- fase-14-11: programada para otro día — se ve, pero apagada -->
                @if (!disponibleHoy(a)) {
                  <p class="mt-0.5 text-xs font-semibold text-sky-600 dark:text-sky-400">
                    🗓 solo {{ describirDias(diasDe(a)) }}
                  </p>
                } @else {
                  <!-- fase-14-12: denegada por el tutor — reemplaza al subtítulo -->
                  @if (denegada(a)) {
                    <p class="mt-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                      ⛔ Tu tutor marcó que no la hiciste
                    </p>
                  } @else {
                    <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      @if (esConfirmable(a)) {
                        <span class="font-semibold text-amber-600 dark:text-amber-400">Obligatoria</span> · confirmá que la hiciste
                      } @else if (esObligatoriaPasiva(a)) {
                        <span class="font-semibold text-amber-600 dark:text-amber-400">Obligatoria</span>
                      } @else {
                        <span class="font-bold text-marca-600 dark:text-marca-400">+{{ a.valorPuntos }} pts</span>
                        @if (a.tipoLimiteTiempo === 'DEADLINE') {
                          · hasta {{ a.deadlineHora }}
                        } @else if (a.tipoLimiteTiempo === 'CRONOMETRO') {
                          · {{ a.duracionCronometroMinutos }} min
                        }
                      }
                    </p>
                  }

                  <!-- Barrita de repeticiones: solo opcional repetible (fase-14-08).
                       Las que el tutor quemó van en rojo y NO vuelven (fase-14-12). -->
                  @if (esRepetible(a)) {
                    <div class="mt-2 flex items-center gap-2">
                      <div class="flex gap-1">
                        @for (segmento of segmentos(a); track $index) {
                          <span
                            class="h-2 w-6 rounded-full transition-colors duration-300"
                            [class]="claseSegmento(segmento)"
                          ></span>
                        }
                      </div>
                      <span class="text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                        {{ vecesHechas(a) }} de {{ a.repeticionesMaximasSesion }}
                        @if (vecesPerdidas(a); as perdidas) {
                          <span class="text-red-600 dark:text-red-400">
                            · {{ perdidas }} perdida{{ perdidas === 1 ? '' : 's' }}
                          </span>
                        }
                      </span>
                    </div>
                  }

                  <!-- fase-14-12: la nota que dejó el tutor, si dejó alguna -->
                  @if (motivoTutor(a); as motivo) {
                    <p class="mt-1 text-xs italic text-red-600/90 dark:text-red-400/90">
                      «{{ motivo }}»
                    </p>
                  }
                }
              </div>

              @if (!disponibleHoy(a)) {
                <!-- Sin acción: hoy no le toca. La verdad del día la decide el
                     servidor (conoce la timezone del Grupo), no el navegador. -->
                <span class="shrink-0 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                  Otro día
                </span>
              } @else if (bloqueada(a)) {
                <!-- fase-14-12: sin botón — solo el tutor puede sacar la marca. -->
                <span class="shrink-0 animate-pop rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                  No hecha
                </span>
              } @else if (esObligatoriaPasiva(a)) {
                <span class="shrink-0 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  Obligatoria
                </span>
              } @else if (mostrarCheck(a)) {
                <span class="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white animate-pop">
                  <span class="h-5 w-5"><app-icono nombre="check" /></span>
                </span>
              } @else if (a.tipoLimiteTiempo === 'CRONOMETRO' && !cronometroDe(a.id) && !topeAlcanzado(a)) {
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
                  [disabled]="procesando() || topeAlcanzado(a)"
                  class="shrink-0 rounded-full bg-marca-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
                >
                  {{ etiquetaBoton(a) }}
                </button>
              }
            </li>
          } @empty {
            <li class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              @if (bloque.esPropio) {
                Todavía no armaste ninguna meta propia. 🌱
              } @else {
                No hay actividades activas.
              }
            </li>
          }
        </ul>
        }
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

  /** Estado real del servidor por actividad (fase-14-08): reemplaza el `Set` optimista. */
  private readonly estadoHoy = signal<MiEstadoHoyDto | null>(null);

  private readonly estadoPorActividad = computed(() => {
    const mapa = new Map<string, MiEstadoActividadHoyDto>();

    for (const item of this.estadoHoy()?.actividades ?? []) {
      mapa.set(item.actividadId, item);
    }

    return mapa;
  });

  private readonly cronometros = signal<CronometroActivo[]>([]);

  protected readonly haySesionAbierta = computed(
    () => this.seccion()?.sesiones.some((s) => s.estado === 'ABIERTA') ?? false
  );

  /** Modo de creación de contenido del grupo (fase-14-10). */
  private readonly modoContenido = signal<ModoCreacionContenidoUsuario>(
    ModoCreacionContenidoUsuario.RESTRICTIVO
  );

  /**
   * La lista de hoy en dos bloques (fase-14-10): el catálogo del tutor y "Mis
   * metas" (las que armó el propio integrante — `origen = USUARIO`; el backend
   * ya garantiza que nunca vienen las de otro). El bloque propio aparece si tiene
   * alguna o si el grupo habilitó que cree, así puede descubrir la función.
   */
  protected readonly bloques = computed(() => {
    const todas = this.actividades();
    const propias = todas.filter((a) => a.origen === OrigenActividad.USUARIO);
    const delTutor = todas.filter((a) => a.origen !== OrigenActividad.USUARIO);
    const habilitado = this.modoContenido() !== ModoCreacionContenidoUsuario.RESTRICTIVO;

    const bloques = [{ titulo: 'Actividades de hoy', items: delTutor, esPropio: false }];

    if (propias.length > 0 || habilitado) {
      bloques.push({ titulo: 'Mis metas', items: propias, esPropio: true });
    }

    return bloques;
  });

  constructor() {
    // Reacciona al grupo activo (fase-14, participante multi-grupo): al cambiarlo
    // en el selector, se recarga la pantalla con los datos del grupo elegido.
    effect(() => {
      this.auth.grupoUsuario();
      this.cargar();
    });
  }

  protected cronometroDe(actividadId: string): CronometroActivo | undefined {
    return this.cronometros().find((c) => c.actividadId === actividadId);
  }

  protected vecesHechas(a: ActividadDto): number {
    return this.estadoPorActividad().get(a.id)?.vecesHechas ?? 0;
  }

  /** fase-14-12: repeticiones que el tutor quemó — las barritas rojas. */
  protected vecesPerdidas(a: ActividadDto): number {
    return this.estadoPorActividad().get(a.id)?.vecesPerdidas ?? 0;
  }

  /**
   * fase-14-12: el tope REAL de hoy. Mientras no llegue el estado del servidor
   * se asume el máximo nominal: apagar un botón por un dato que no cargó es
   * peor que dejarlo (el servidor rechaza igual si no corresponde).
   */
  protected topeEfectivo(a: ActividadDto): number {
    return this.estadoPorActividad().get(a.id)?.topeEfectivo ?? a.repeticionesMaximasSesion;
  }

  /** fase-14-12: el tutor marcó que no la hizo (obligatoria denegada). */
  protected denegada(a: ActividadDto): boolean {
    return this.estadoPorActividad().get(a.id)?.denegada ?? false;
  }

  protected motivoTutor(a: ActividadDto): string | null {
    return this.estadoPorActividad().get(a.id)?.motivoTutor ?? null;
  }

  /**
   * fase-14-12: no hay nada que el integrante pueda hacer hoy con esta
   * actividad, y no porque la haya completado: o el tutor la denegó, o le quitó
   * todo el cupo (el caso de una opcional no repetible a la que le sacaron su
   * única completada). Solo el tutor puede sacar la marca.
   */
  protected bloqueada(a: ActividadDto): boolean {
    return this.denegada(a) || (this.vecesPerdidas(a) > 0 && this.topeEfectivo(a) === 0);
  }

  /** Borde de la tarjeta: rojo si está bloqueada, verde si quedó completa. */
  protected clasesTarjeta(a: ActividadDto): string {
    if (this.bloqueada(a)) {
      return 'border-red-300 bg-red-50/70 dark:border-red-800 dark:bg-red-950/30';
    }

    if (this.resaltado(a)) {
      return 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40';
    }

    return 'border-slate-100 dark:border-slate-800';
  }

  protected claseSegmento(segmento: EstadoSegmento): string {
    switch (segmento) {
      case 'hecho':
        return 'bg-marca-500';
      case 'perdido':
        // Rayado además de rojo (ver `.segmento-perdido` en theme.css).
        return 'segmento-perdido';
      default:
        return 'bg-slate-200 dark:bg-slate-700';
    }
  }

  /**
   * fase-14-11: lo dice el servidor (`mi-estado-hoy`), que es el que conoce la
   * timezone del Grupo y el día de la Sesión. Si todavía no llegó el estado, se
   * asume disponible: es peor apagar un botón por un dato que no cargó.
   */
  protected disponibleHoy(a: ActividadDto): boolean {
    return this.estadoPorActividad().get(a.id)?.disponibleHoy ?? true;
  }

  /** Días configurados de la actividad, según el estado del servidor. */
  protected diasDe(a: ActividadDto): number[] {
    return this.estadoPorActividad().get(a.id)?.diasSemana ?? a.diasSemana;
  }

  protected describirDias(dias: number[]): string {
    return describirDias(dias);
  }

  protected esConfirmable(a: ActividadDto): boolean {
    return a.tipoPuntaje === 'OBLIGATORIA' && a.comportamientoAlCierre === 'REQUIERE_CONFIRMACION';
  }

  protected esObligatoriaPasiva(a: ActividadDto): boolean {
    return a.tipoPuntaje === 'OBLIGATORIA' && a.comportamientoAlCierre === 'ASUME_HECHA';
  }

  protected esRepetible(a: ActividadDto): boolean {
    // Solo tiene sentido pintar la barrita para opcionales repetibles.
    return a.tipoPuntaje === 'OPCIONAL' && a.repeticionesMaximasSesion > 1;
  }

  /**
   * Segmentos de la barrita, en orden: las hechas, las que todavía se pueden
   * hacer y —al final— las que el tutor quemó (fase-14-12). Siempre suman
   * `repeticionesMaximasSesion`: el máximo nominal no cambia, lo que cambia es
   * cuántos de esos slots siguen siendo alcanzables.
   */
  protected segmentos(a: ActividadDto): EstadoSegmento[] {
    const hechas = this.vecesHechas(a);
    const libres = Math.max(0, this.topeEfectivo(a) - hechas);

    return [
      ...Array<EstadoSegmento>(hechas).fill('hecho'),
      ...Array<EstadoSegmento>(libres).fill('libre'),
      ...Array<EstadoSegmento>(this.vecesPerdidas(a)).fill('perdido'),
    ];
  }

  /** Tope de la actividad alcanzado: nada más que hacer (deshabilita el botón). */
  protected topeAlcanzado(a: ActividadDto): boolean {
    if (this.esObligatoriaPasiva(a)) {
      return false;
    }

    if (this.esConfirmable(a)) {
      return this.estadoPorActividad().get(a.id)?.confirmada ?? false;
    }

    // Contra el tope EFECTIVO (fase-14-12): con una repetición quemada el
    // servidor ya no acepta otra, así que el botón no puede prometerla.
    return this.vecesHechas(a) >= this.topeEfectivo(a);
  }

  /**
   * Resaltado verde + tachado: la actividad quedó completa. Con alguna
   * repetición perdida no se pinta de verde aunque no quede nada por hacer —
   * "llegaste al tope porque te quitaron una" no es un logro (fase-14-12).
   */
  protected resaltado(a: ActividadDto): boolean {
    return (
      !this.esObligatoriaPasiva(a) &&
      !this.bloqueada(a) &&
      this.vecesPerdidas(a) === 0 &&
      this.topeAlcanzado(a)
    );
  }

  /** ✓ en vez de botón: no repetible ya hecha, o confirmable confirmada. */
  protected mostrarCheck(a: ActividadDto): boolean {
    if (this.esObligatoriaPasiva(a) || this.esRepetible(a)) {
      return false;
    }

    return this.topeAlcanzado(a);
  }

  protected etiquetaBoton(a: ActividadDto): string {
    if (this.esConfirmable(a)) {
      return 'Ya lo hice';
    }

    if (this.cronometroDe(a.id)) {
      return 'Listo';
    }

    return 'Completar';
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
        this.cronometros.update((l) => l.filter((c) => c.actividadId !== a.id));
        this.procesando.set(false);
        this.toasts.exito(
          this.esConfirmable(a) ? '¡Confirmado! ✅' : `¡+${a.valorPuntos} puntos! 🎉`
        );
        // Estado real desde el servidor tras cada acción (fase-14-08).
        this.recargarEstado();
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
          estado: this.activity.miEstadoHoy(grupoId),
        }).subscribe({
          next: ({ actividades, puntaje, estado }) => {
            this.actividades.set(actividades);
            this.puntaje.set(puntaje);
            this.estadoHoy.set(estado);
            this.cargando.set(false);
          },
          error: () => this.cargando.set(false),
        });

        // fase-14-10: el modo del grupo decide si se ofrece "Crear la mía".
        // Falla en silencio: es accesorio, no debe romper la home.
        this.activity.obtenerConfiguracionContenido(grupoId).subscribe({
          next: (config) => this.modoContenido.set(config.modoCreacionUsuario),
          error: () => undefined,
        });
      },
      error: () => this.cargando.set(false),
    });
  }

  private recargarEstado(): void {
    const grupoId = this.auth.grupoUsuario();

    if (!grupoId) {
      return;
    }

    this.activity.miEstadoHoy(grupoId).subscribe({
      next: (estado) => this.estadoHoy.set(estado),
      error: () => undefined,
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
