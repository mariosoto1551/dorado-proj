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

import {
  EstadoReporte,
  ModoSesion,
  type EventoHistorialDto,
  type PuntajeUsuarioDto,
  type UmbralZonaDto,
  type UsuarioDto,
} from '@dorado/shared-types';
import { EstadoSeccionBadgeComponent, ZonaBadgeComponent } from '@dorado/shared-ui';

import { IconoComponent } from '../../componentes/icono.component';
import { ActivityApiService } from '../../core/api/activity-api.service';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { RewardsApiService } from '../../core/api/rewards-api.service';
import { ScoringApiService } from '../../core/api/scoring-api.service';
import { SessionApiService } from '../../core/api/session-api.service';
import type { SeccionConSesionesResponse } from '../../core/api/api.types';
import { GuiaSetupService } from '../../core/guia/guia-setup.service';
import {
  accionPrincipal,
  progresoHaciaLaZonaSiguiente,
  textoDePendientes,
} from '../../core/home-grupo';
import { formatearHora, iconoDeEvento } from './historial-sesion.util';

interface FilaRanking extends PuntajeUsuarioDto {
  nombre: string;
  posicion: number;
  /** 0–1 hacia el techo de su zona; alimenta la barra. */
  progreso: number;
}

interface Pendiente {
  texto: string;
  destino: string[];
}

/** Cuántas marcas del día muestra el home antes de mandar al historial completo. */
const MARCAS_EN_EL_HOME = 3;

/**
 * Home del grupo (fase-14-23 T3).
 *
 * Antes era el «Resumen»: la pantalla de aterrizaje mostraba, sin Sección
 * activa, **una sola tarjeta vacía** con dos botones del mismo peso. No decía en
 * qué día iba la semana, qué tocaba hacer, ni qué estaba esperando al Tutor.
 *
 * Muestra cuatro cosas, pero **con jerarquía y no en paralelo** (decisión 3 de
 * la tanda), que es lo que hace que no pese:
 *  1. una sola cosa grande — la semana y el botón de lo que toca ahora;
 *  2. «te esperan» **condicional**: sin pendientes el bloque no existe, así que
 *     el caso normal son tres bloques y no cuatro;
 *  3. «cómo van», una FILA por persona (no una tarjeta);
 *  4. «hoy», tres líneas con «ver todo» al historial del #18.
 */
@Component({
  selector: 'app-resumen-grupo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EstadoSeccionBadgeComponent, ZonaBadgeComponent, IconoComponent],
  template: `
    <section class="mx-auto max-w-3xl px-4 py-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
          Resumen del grupo
        </h1>
        @if (seccion(); as s) {
          <ui-estado-seccion-badge [estado]="s.estado" />
        }
      </div>

      <!-- Primeros pasos: desde la T3, el ÚNICO lugar donde aparece la guía -->
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
              Vas {{ guia.completados() }} de {{ guia.totalPasos }} pasos.
            </p>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-marca-200/70 dark:bg-marca-900/50">
              <div
                class="h-full rounded-full bg-marca-600 transition-all duration-700"
                [style.width.%]="(guia.completados() / guia.totalPasos) * 100"
              ></div>
            </div>
          </div>
        </a>
      }

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else {
        <!-- ===== 1. La semana (lo único grande) ===== -->
        <div class="mt-4 tarjeta">
          @if (seccion(); as s) {
            <p class="text-sm font-bold text-slate-900 dark:text-white">
              Semana {{ s.numero }} ·
              {{ s.sesiones.length }} {{ s.sesiones.length === 1 ? 'sesión' : 'sesiones' }}
            </p>
            <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {{ ranking().length }}
              {{ ranking().length === 1 ? 'participante' : 'participantes' }}
              @if (puntosIniciales() !== null) {
                · arrancan con {{ puntosIniciales() }}
              }
            </p>
          } @else {
            <p class="text-sm font-bold text-slate-900 dark:text-white">
              Todavía no arrancó ninguna semana
            </p>
            <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Cuando inicies la primera, acá vas a ver en qué día va y qué falta.
            </p>
          }

          <a
            [routerLink]="['/grupos', grupoId(), ...accion().destino]"
            class="mt-4 w-full boton boton-primario py-3"
          >
            {{ accion().etiqueta }}
          </a>
        </div>

        <!-- ===== 2. Te esperan (SOLO si hay algo) ===== -->
        @if (pendientes().length > 0) {
          <div class="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 animate-fade-in dark:border-amber-500/30 dark:bg-amber-500/10">
            <p class="text-sm font-bold text-amber-800 dark:text-amber-200">
              ⚠ {{ textoPendientes() }}
            </p>
            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              @for (p of pendientes(); track p.texto) {
                <a
                  [routerLink]="['/grupos', grupoId(), ...p.destino]"
                  class="text-sm font-semibold text-amber-800 underline-offset-2 hover:underline dark:text-amber-200"
                >
                  {{ p.texto }}
                </a>
              }
            </div>
          </div>
        }

        <!-- ===== 3. Cómo van (una fila por persona) ===== -->
        @if (ranking().length > 0) {
          <h2 class="mt-6 text-sm font-bold text-slate-900 dark:text-white">Cómo van</h2>
          <ul class="mt-2 space-y-1.5">
            @for (fila of ranking(); track fila.usuarioId) {
              <li
                class="flex items-center gap-3 tarjeta px-4 py-2.5"
                [class.opacity-50]="fila.descalificado"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {{ fila.nombre }}
                    @if (fila.descalificado) {
                      <span class="text-xs font-normal text-red-500 dark:text-red-400">
                        (descalificado)
                      </span>
                    }
                  </span>
                  <span class="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <span
                      class="block h-full rounded-full transition-all duration-700"
                      [style.width.%]="fila.progreso * 100"
                      [style.background-color]="fila.zona?.colorHex ?? '#94a3b8'"
                    ></span>
                  </span>
                </span>
                @if (fila.zona) {
                  <ui-zona-badge [zona]="fila.zona" tamano="sm" />
                }
                <span class="w-12 shrink-0 text-right text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                  {{ fila.puntajeTotal }}
                </span>
              </li>
            }
          </ul>
        }

        <!-- ===== 4. Hoy (tres líneas) ===== -->
        <div class="mt-6 flex items-baseline justify-between gap-3">
          <h2 class="text-sm font-bold text-slate-900 dark:text-white">Hoy</h2>
          @if (marcas().length > 0) {
            <a
              [routerLink]="['/grupos', grupoId(), 'secciones', 'actual']"
              class="text-xs font-semibold text-marca-600 hover:underline dark:text-marca-300"
            >
              ver todo →
            </a>
          }
        </div>

        @if (marcas().length === 0) {
          <p class="mt-2 text-sm text-slate-400 dark:text-slate-500">
            Todavía no se registró nada hoy.
          </p>
        } @else {
          <ul class="mt-2 space-y-1">
            @for (e of marcas(); track e.id) {
              <li class="flex items-baseline gap-2.5 text-sm">
                <span class="font-mono text-xs text-slate-400 dark:text-slate-500">
                  {{ hora(e) }}
                </span>
                <span aria-hidden="true">{{ icono(e) }}</span>
                <span class="font-semibold text-slate-800 dark:text-slate-100">
                  {{ e.usuarioNombre ?? e.equipoNombre }}
                </span>
                <span class="min-w-0 flex-1 truncate text-slate-500 dark:text-slate-400">
                  {{ e.itemNombre }}
                </span>
                <span
                  class="shrink-0 font-bold tabular-nums"
                  [class]="e.puntos < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
                >
                  {{ e.puntos > 0 ? '+' : '' }}{{ e.puntos }}
                </span>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
})
export class ResumenGrupoPage {
  readonly grupoId = input.required<string>();

  private readonly session = inject(SessionApiService);

  private readonly scoring = inject(ScoringApiService);

  private readonly identity = inject(IdentityApiService);

  private readonly activity = inject(ActivityApiService);

  private readonly rewards = inject(RewardsApiService);

  protected readonly guia = inject(GuiaSetupService);

  protected readonly cargando = signal(true);

  protected readonly seccion = signal<SeccionConSesionesResponse | null>(null);

  /** Base de puntos iniciales del grupo (fase-14); null hasta cargarla. */
  protected readonly puntosIniciales = signal<number | null>(null);

  private readonly puntajes = signal<PuntajeUsuarioDto[]>([]);

  private readonly usuarios = signal<UsuarioDto[]>([]);

  private readonly umbrales = signal<UmbralZonaDto[]>([]);

  private readonly esManual = signal(true);

  private readonly eventos = signal<EventoHistorialDto[]>([]);

  private readonly timezone = signal('UTC');

  private readonly reportesPendientes = signal(0);

  private readonly entregasPendientes = signal(0);

  protected readonly ranking = computed<FilaRanking[]>(() => {
    const mapa = new Map(this.usuarios().map((u) => [u.id, u.nombre]));
    const umbrales = this.umbrales();

    return [...this.puntajes()]
      .sort((a, b) => b.puntajeTotal - a.puntajeTotal)
      .map((p, i) => ({
        ...p,
        nombre: mapa.get(p.usuarioId) ?? 'Usuario',
        posicion: i + 1,
        progreso: progresoHaciaLaZonaSiguiente(p.puntajeTotal, umbrales),
      }));
  });

  protected readonly accion = computed(() =>
    accionPrincipal({
      seccion: this.seccion(),
      esManual: this.esManual(),
    })
  );

  /** Lo que espera al Tutor. Vacío = el bloque no se renderiza. */
  protected readonly pendientes = computed<Pendiente[]>(() => {
    const lista: Pendiente[] = [];
    const reportes = this.reportesPendientes();
    const entregas = this.entregasPendientes();

    if (reportes > 0) {
      lista.push({
        texto: `${reportes} reporte${reportes === 1 ? '' : 's'} por aprobar`,
        destino: ['reportes'],
      });
    }

    if (entregas > 0) {
      lista.push({
        texto: `${entregas} entrega${entregas === 1 ? '' : 's'} por dar`,
        destino: ['entregas'],
      });
    }

    return lista;
  });

  protected readonly textoPendientes = computed(() =>
    textoDePendientes(this.reportesPendientes() + this.entregasPendientes())
  );

  /** Las últimas marcas del día, acotadas: el historial completo vive en el panel. */
  protected readonly marcas = computed(() => this.eventos().slice(0, MARCAS_EN_EL_HOME));

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
      // Refresco forzado del progreso de setup: el home es el punto natural
      // para reevaluar qué falta configurar.
      this.guia.cargar(g, true);
    });
  }

  protected hora(evento: EventoHistorialDto): string {
    return formatearHora(evento.ocurridoEn, this.timezone());
  }

  protected icono(evento: EventoHistorialDto): string {
    return iconoDeEvento(evento);
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);
    this.seccion.set(null);
    this.puntajes.set([]);
    this.puntosIniciales.set(null);
    this.eventos.set([]);
    this.reportesPendientes.set(0);
    this.entregasPendientes.set(0);

    // Las cuatro secundarias son best-effort: si una falla, el home igual sirve.
    this.scoring.obtenerConfiguracion(grupoId).subscribe({
      next: (config) => this.puntosIniciales.set(config.puntosIniciales),
      error: () => undefined,
    });

    this.scoring.listarUmbrales(grupoId).subscribe({
      next: (u) => this.umbrales.set(u),
      error: () => undefined,
    });

    this.session.obtenerConfiguracion(grupoId).subscribe({
      next: (c) => this.esManual.set(c.modo === ModoSesion.MANUAL),
      error: () => undefined,
    });

    this.activity.historial(grupoId, { limite: MARCAS_EN_EL_HOME }).subscribe({
      next: (h) => {
        this.eventos.set(h.eventos);
        this.timezone.set(h.timezoneGrupo);
      },
      error: () => undefined,
    });

    this.activity.listarReportes(grupoId, EstadoReporte.PENDIENTE).subscribe({
      next: (r) => this.reportesPendientes.set(r.length),
      error: () => undefined,
    });

    this.rewards.pendientesDeEntrega(grupoId).subscribe({
      next: (p) => this.entregasPendientes.set(p.length),
      error: () => undefined,
    });

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
