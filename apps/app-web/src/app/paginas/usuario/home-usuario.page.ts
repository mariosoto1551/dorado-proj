import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';

import {
  type ActividadDto,
  AlcanceActividad,
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
import { compararPrioridad } from '../../core/prioridad-actividades';

interface CronometroActivo {
  actividadId: string;
  venceEn: number;
}

/**
 * Estado de un segmento de la barrita de repeticiones. `perdido` es fase-14-12:
 * un intento que el tutor quemó y que el integrante no recupera.
 */
type EstadoSegmento = 'hecho' | 'libre' | 'perdido';

/** Un bloque de la lista de hoy, ya ordenado y partido en tramos (fase-14-14). */
interface BloqueLista {
  titulo: string;
  esPropio: boolean;
  /** fase-14-15: bloque de tareas de equipo — solo informativo, sin acción. */
  esEquipo: boolean;
  /** Pendientes primero, terminadas después; las dos partes ya ordenadas. */
  items: ActividadDto[];
  /** Cuántas quedan por hacer (va en el chip del encabezado). */
  pendientes: number;
  /** Índice donde arranca el tramo de terminadas; -1 si no hay ninguna. */
  corte: number;
}

/** Umbrales de la cuenta regresiva, en minutos (fase-14-14). */
const MINUTOS_AVISO = 180;

const MINUTOS_URGENTE = 60;

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
          <div class="flex items-baseline gap-2">
            <h2 class="text-sm font-bold text-slate-500 uppercase dark:text-slate-400">{{ bloque.titulo }}</h2>
            @if (bloque.pendientes > 0) {
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 tabular-nums dark:bg-slate-800 dark:text-slate-400">
                {{ bloque.pendientes }}
              </span>
            }
          </div>
          @if (bloque.esPropio) {
            <a
              routerLink="/mis-actividades"
              class="flex items-center gap-1 rounded-full bg-marca-50 px-3 py-1.5 text-xs font-semibold text-marca-700 transition hover:bg-marca-100 dark:bg-marca-900/30 dark:text-marca-300 dark:hover:bg-marca-900/50"
            >
              <span class="h-3.5 w-3.5"><app-icono nombre="plus" /></span>
              Crear la mía
            </a>
          } @else if (bloque.esEquipo) {
            <!-- fase-14-15: acá no se marcan; se marcan en Mi equipo. -->
            <a
              routerLink="/mi-equipo"
              class="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 dark:bg-teal-500/15 dark:text-teal-300 dark:hover:bg-teal-500/25"
            >
              Ir a Mi equipo →
            </a>
          }
        </div>
        <ul class="space-y-2.5">
          @for (a of bloque.items; track a.id; let i = $index) {
            <!-- fase-14-14: frontera entre lo que queda por hacer y lo que ya
                 no requiere acción. Un solo separador, no encabezados por tramo. -->
            @if (i === bloque.corte) {
              <li class="flex items-center gap-2 py-1" aria-hidden="true">
                <span class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></span>
                <span class="text-xs font-semibold text-slate-400 dark:text-slate-500">
                  {{ bloque.pendientes === 0 ? '¡Todo listo por hoy! 🎉' : 'Ya está' }}
                </span>
                <span class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></span>
              </li>
            }
            <li
              class="flex items-center gap-3 rounded-2xl border-2 bg-white p-4 shadow-sm transition dark:bg-slate-900"
              [class]="clasesTarjeta(a)"
              [class.opacity-60]="terminada(a)"
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
                    <!-- fase-14-14: la hora límite se muestra también en las
                         obligatorias (antes solo en las opcionales), porque es
                         justamente lo que decide la prioridad de la lista. -->
                    <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      @if (esDeEquipo(a)) {
                        <!-- fase-14-15: valorPuntos es POR INTEGRANTE en una
                             tarea de equipo, así que "c/u" y no "pts". -->
                        <span class="font-bold text-teal-600 dark:text-teal-400">+{{ a.valorPuntos }} c/u</span>
                      } @else if (esObligatoria(a)) {
                        <span class="font-semibold text-amber-600 dark:text-amber-400">Obligatoria</span>
                      } @else {
                        <span class="font-bold text-marca-600 dark:text-marca-400">+{{ a.valorPuntos }} pts</span>
                      }
                      @if (a.tipoLimiteTiempo === 'DEADLINE') {
                        · <span [class]="claseDeadline(a)">{{ textoDeadline(a) }}</span>
                      } @else if (a.tipoLimiteTiempo === 'CRONOMETRO') {
                        · {{ a.duracionCronometroMinutos }} min
                      } @else if (esConfirmable(a)) {
                        · confirmá que la hiciste
                      }
                    </p>
                    @if (esDeEquipo(a)) {
                      <p class="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        La marca el jefe desde «Mi equipo»
                      </p>
                    }
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
              } @else if (esDeEquipo(a)) {
                <!-- fase-14-15: solo informativa acá. El backend la rechaza por
                     esta vía (400 ES_TAREA_DE_EQUIPO), así que no hay botón. -->
                <span class="shrink-0 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                  Equipo
                </span>
              } @else if (bloqueada(a)) {
                <!-- fase-14-12: sin botón — solo el tutor puede sacar la marca. -->
                <span class="shrink-0 animate-pop rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                  No hecha
                </span>
              } @else if (soloVencida(a)) {
                <!-- fase-14-14: el servidor ya no la acepta (409 DEADLINE_VENCIDO),
                     así que la pantalla deja de ofrecer el botón. -->
                <span class="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Venció
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

  private readonly destroyRef = inject(DestroyRef);

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

  /**
   * "Ahora", para la cuenta regresiva de los deadlines (fase-14-14). Un solo
   * intervalo para toda la lista; 30 s alcanza porque el texto se muestra en
   * minutos. Al cambiar, se recalculan las clases de urgencia Y el orden (una
   * actividad que vence se hunde sola al tramo de terminadas).
   */
  private readonly ahora = signal(Date.now());

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
   *
   * Cada bloque viene ORDENADO por prioridad (fase-14-14) y con `corte`: el
   * índice donde arrancan las que ya no requieren acción, para que la plantilla
   * meta ahí el separador sin duplicar el template de la tarjeta.
   */
  protected readonly bloques = computed(() => {
    const todas = this.actividades();
    // fase-14-15: las de equipo salen a su propio bloque. No las completa este
    // usuario (el backend las rechaza con 400 ES_TAREA_DE_EQUIPO), así que
    // mezcladas con las suyas prometían una acción que no existe.
    const deEquipo = todas.filter((a) => a.alcance === AlcanceActividad.EQUIPO);
    const individuales = todas.filter((a) => a.alcance !== AlcanceActividad.EQUIPO);
    const propias = individuales.filter((a) => a.origen === OrigenActividad.USUARIO);
    const delTutor = individuales.filter((a) => a.origen !== OrigenActividad.USUARIO);
    const habilitado = this.modoContenido() !== ModoCreacionContenidoUsuario.RESTRICTIVO;

    const bloques = [this.armarBloque('Actividades de hoy', delTutor)];

    if (deEquipo.length > 0) {
      bloques.push(this.armarBloque('De tu equipo', deEquipo, { esEquipo: true }));
    }

    if (propias.length > 0 || habilitado) {
      bloques.push(this.armarBloque('Mis metas', propias, { esPropio: true }));
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

    // fase-14-14: reloj de la cuenta regresiva, con su limpieza registrada —
    // un intervalo colgado sigue despertando la app después de salir.
    const reloj = setInterval(() => this.ahora.set(Date.now()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(reloj));
  }

  /**
   * Ordena por prioridad y parte en dos tramos: primero lo que le queda por
   * hacer, después lo que ya no requiere acción (fase-14-14, decisión 2).
   */
  private armarBloque(
    titulo: string,
    items: ActividadDto[],
    tipo: { esPropio?: boolean; esEquipo?: boolean } = {}
  ): BloqueLista {
    const pendientes = items
      .filter((a) => !this.terminada(a))
      .sort((a, b) => compararPrioridad(a, b, (item) => this.venceEn(item)));
    const terminadas = items
      .filter((a) => this.terminada(a))
      .sort((a, b) => compararPrioridad(a, b, (item) => this.venceEn(item)));

    return {
      titulo,
      esPropio: tipo.esPropio ?? false,
      esEquipo: tipo.esEquipo ?? false,
      items: [...pendientes, ...terminadas],
      pendientes: pendientes.length,
      // -1 = no hay tramo de terminadas, así que el separador nunca coincide.
      corte: terminadas.length > 0 ? pendientes.length : -1,
    };
  }

  /**
   * Ya no requiere acción hoy: la hizo, el tutor la denegó o le quemó el cupo,
   * se le venció la hora o está programada para otro día. Una obligatoria
   * `ASUME_HECHA` NO cuenta: no tiene botón, pero sigue siendo algo que hay que
   * hacer hoy, así que se queda arriba (fase-14-14).
   */
  protected terminada(a: ActividadDto): boolean {
    if (!this.disponibleHoy(a) || this.bloqueada(a) || this.vencida(a)) {
      return true;
    }

    if (this.esObligatoriaPasiva(a)) {
      return false;
    }

    return this.topeAlcanzado(a);
  }

  protected esObligatoria(a: ActividadDto): boolean {
    return a.tipoPuntaje === 'OBLIGATORIA';
  }

  /**
   * fase-14-15: tarea de equipo. Acá es solo informativa — la completa el jefe
   * desde «Mi equipo» y por esta vía el backend responde 400 ES_TAREA_DE_EQUIPO.
   */
  protected esDeEquipo(a: ActividadDto): boolean {
    return a.alcance === AlcanceActividad.EQUIPO;
  }

  /** Instante de vencimiento en ms; MAX_SAFE_INTEGER si no tiene hora límite. */
  private venceEn(a: ActividadDto): number {
    const iso = this.estadoPorActividad().get(a.id)?.deadlineEn;

    return iso ? Date.parse(iso) : Number.MAX_SAFE_INTEGER;
  }

  /** La hora límite ya pasó. El servidor rechaza igual (409 DEADLINE_VENCIDO). */
  protected vencida(a: ActividadDto): boolean {
    return this.ahora() >= this.venceEn(a);
  }

  /** Venció y encima no la había hecho: es lo único que amerita el chip "Venció". */
  protected soloVencida(a: ActividadDto): boolean {
    return this.vencida(a) && !this.topeAlcanzado(a);
  }

  /**
   * Texto de la hora límite. Lejos muestra la hora ("hasta 14:00"); cerca pasa a
   * cuenta regresiva, que es lo que de verdad apura. Sin `deadlineEn` (identity
   * no respondió) cae a la hora pelada, como antes de fase-14-14.
   */
  protected textoDeadline(a: ActividadDto): string {
    const vence = this.venceEn(a);

    if (vence === Number.MAX_SAFE_INTEGER) {
      return a.deadlineHora ? `hasta ${a.deadlineHora}` : '';
    }

    const minutos = Math.floor((vence - this.ahora()) / 60_000);

    if (minutos < 0) {
      return `venció ${a.deadlineHora}`;
    }

    if (minutos > MINUTOS_AVISO) {
      return `hasta ${a.deadlineHora}`;
    }

    if (minutos >= 60) {
      const horas = Math.floor(minutos / 60);
      const resto = minutos % 60;

      return resto === 0 ? `vence en ${horas} h` : `vence en ${horas} h ${resto} m`;
    }

    return minutos === 0 ? 'vence en menos de 1 m' : `vence en ${minutos} m`;
  }

  /** Color por urgencia: neutro → ámbar (≤3 h) → rojo (≤1 h) → gris tachado. */
  protected claseDeadline(a: ActividadDto): string {
    const vence = this.venceEn(a);

    if (vence === Number.MAX_SAFE_INTEGER) {
      return '';
    }

    const minutos = (vence - this.ahora()) / 60_000;

    if (minutos < 0) {
      return 'text-slate-400 line-through dark:text-slate-500';
    }

    if (minutos <= MINUTOS_URGENTE) {
      return 'font-bold text-red-600 dark:text-red-400';
    }

    if (minutos <= MINUTOS_AVISO) {
      return 'font-semibold text-amber-600 dark:text-amber-400';
    }

    return '';
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

  /**
   * Borde de la tarjeta: rojo si está bloqueada, verde si quedó completa, y
   * acento ámbar a la izquierda en las obligatorias (fase-14-14, decisión 3) —
   * la jerarquía se ve sin leer, sin encabezados de tramo.
   */
  protected clasesTarjeta(a: ActividadDto): string {
    // fase-14-15: acento teal, distinto del ámbar de obligatoria, para que no se
    // lea como "urgente" algo que este usuario no puede tocar.
    if (this.esDeEquipo(a)) {
      return 'border-slate-100 border-l-4 border-l-teal-400 dark:border-slate-800 dark:border-l-teal-500';
    }

    if (this.bloqueada(a)) {
      return 'border-red-300 bg-red-50/70 dark:border-red-800 dark:bg-red-950/30';
    }

    if (this.resaltado(a)) {
      return 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40';
    }

    if (this.esObligatoria(a)) {
      return 'border-slate-100 border-l-4 border-l-amber-400 dark:border-slate-800 dark:border-l-amber-500';
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
    // Solo tiene sentido pintar la barrita para opcionales repetibles. Las de
    // equipo quedan afuera (fase-14-15): sus completadas viven en
    // RegistroTareaEquipo, así que `vecesHechas` es siempre 0 acá y la barrita
    // se vería vacía aunque el jefe ya la haya marcado — se ve en «Mi equipo».
    return (
      a.tipoPuntaje === 'OPCIONAL' &&
      a.repeticionesMaximasSesion > 1 &&
      !this.esDeEquipo(a)
    );
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
