import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, type Observable } from 'rxjs';

import {
  type ActividadDto,
  type CompletadaOpcionalDto,
  type ConductaDto,
  EstadoSesion,
  type MarcaRojaDto,
  type UsuarioDto,
} from '@dorado/shared-types';
import { ConfirmDialogComponent, EstadoSeccionBadgeComponent, EstadoVacioComponent } from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import type { SeccionConSesionesResponse } from '../../core/api/api.types';
import { mensajeDeError } from '../../core/api/errores';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { SessionApiService } from '../../core/api/session-api.service';
import { HistorialSesionComponent } from './historial-sesion.component';

type AccionConfirmable = 'cierre-sesion' | 'evaluacion' | 'cerrar-seccion' | null;

/** fase-14-18: «Registrar» es lo de siempre; «historial» es la línea de tiempo. */
type VistaPanel = 'registrar' | 'historial';

/** Panel operativo del día a día (fase-10): acciones rápidas del tutor sobre la Sección actual. */
@Component({
  selector: 'app-panel-operativo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstadoVacioComponent, 
    FormsModule,
    EncabezadoPaginaComponent,
    EstadoSeccionBadgeComponent,
    ConfirmDialogComponent,
    HistorialSesionComponent,
  ],
  template: `
    <section class="mx-auto max-w-3xl px-4 py-6">
      <app-encabezado-pagina titulo="Semana actual" subtitulo="Registrá lo del día y controlá la sección.">
        @if (seccion(); as s) {
          <ui-estado-seccion-badge [estado]="s.estado" />
        }
      </app-encabezado-pagina>

      <!-- fase-14-18: «Registrar» (lo de siempre) y «Qué pasó hoy» (el historial) -->
      <div class="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
        @for (t of pestanias; track t.valor) {
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="vista() === t.valor"
            (click)="cambiarVista(t.valor)"
            [class]="
              vista() === t.valor
                ? 'flex-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            "
          >
            {{ t.etiqueta }}
          </button>
        }
      </div>

      @if (vista() === 'historial') {
        <div class="mt-4">
          <app-historial-sesion
            [grupoId]="grupoId()"
            [usuarios]="usuarios()"
            [conductas]="conductas()"
          />
        </div>
      } @else if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (!seccion()) {
        <ui-estado-vacio class="mt-6">
          <p class="text-sm text-slate-500 dark:text-slate-400">No hay una Sección activa.</p>
          <button
            type="button"
            (click)="iniciarSeccion()"
            [disabled]="procesando()"
            class="mt-4 boton boton-primario"
          >
            Iniciar primera sección
          </button>
        </ui-estado-vacio>
      } @else {
        <!-- Sesiones -->
        <div class="mt-4 tarjeta">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-slate-900 dark:text-white">Sección #{{ seccion()!.numero }}</h2>
            <span class="text-xs text-slate-400 dark:text-slate-500">{{ seccion()!.sesiones.length }} sesiones</span>
          </div>
          <div class="mt-3 flex flex-wrap gap-1.5">
            @for (s of seccion()!.sesiones; track s.id) {
              <span
                class="rounded-lg px-2.5 py-1 text-xs font-semibold"
                [class]="s.estado === 'ABIERTA' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
              >
                Sesión {{ s.numero }} · {{ s.estado === 'ABIERTA' ? 'abierta' : 'cerrada' }}
              </span>
            }
          </div>
        </div>

        <!-- Acciones rápidas: solo con sección ABIERTA y sesión abierta -->
        @if (seccion()!.estado === 'ABIERTA') {
          @if (sesionAbierta()) {
            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <!-- No hizo -->
              <div class="tarjeta">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white">Registrar «no hizo»</h3>
                <select
                  [(ngModel)]="usuarioNoHizo"
                  class="mt-2 campo"
                >
                  <option value="">Usuario…</option>
                  @for (u of usuarios(); track u.id) {
                    <option [value]="u.id">{{ u.nombre }}</option>
                  }
                </select>
                <select
                  [(ngModel)]="actividadNoHizo"
                  class="mt-2 campo"
                >
                  <option value="">Obligatoria…</option>
                  @for (a of obligatorias(); track a.id) {
                    <option [value]="a.id">{{ a.nombre }}</option>
                  }
                </select>
                <!-- fase-14-12: la nota la ve el integrante en su pantalla. -->
                <input
                  type="text"
                  [(ngModel)]="motivoNoHizo"
                  maxlength="200"
                  placeholder="Motivo (opcional)"
                  class="mt-2 campo"
                />
                <button
                  type="button"
                  (click)="registrarNoHizo()"
                  [disabled]="procesando() || !usuarioNoHizo || !actividadNoHizo"
                  class="mt-2 w-full rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-40 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  Registrar
                </button>
              </div>

              <!-- Conducta -->
              <div class="tarjeta">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white">Registrar conducta</h3>
                <select
                  [(ngModel)]="usuarioConducta"
                  class="mt-2 campo"
                >
                  <option value="">Usuario…</option>
                  @for (u of usuarios(); track u.id) {
                    <option [value]="u.id">{{ u.nombre }}</option>
                  }
                </select>
                <select
                  [(ngModel)]="conductaSel"
                  class="mt-2 campo"
                >
                  <option value="">Conducta…</option>
                  @for (c of conductas(); track c.id) {
                    <option [value]="c.id">
                      {{ c.nombre }} ({{ c.tipo === 'BUENA' ? '+' : '−' }}{{ c.valorPuntos }})
                    </option>
                  }
                </select>
                <button
                  type="button"
                  (click)="registrarConducta()"
                  [disabled]="procesando() || !usuarioConducta || !conductaSel"
                  class="mt-2 w-full rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-40 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  Registrar
                </button>
              </div>
            </div>

            <!-- Corregir completadas de un usuario (fase-14) -->
            <div class="mt-3 tarjeta">
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">Corregir completadas de un usuario</h3>
              <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Quitá opcionales que un usuario marcó de más. Resta los puntos y en su pantalla
                queda una barrita roja: ese intento se le gasta y solo vos podés devolvérselo.
              </p>
              <select
                [(ngModel)]="usuarioCorregir"
                (ngModelChange)="onUsuarioCorregirCambio()"
                class="mt-2 campo"
              >
                <option value="">Usuario…</option>
                @for (u of usuarios(); track u.id) {
                  <option [value]="u.id">{{ u.nombre }}</option>
                }
              </select>

              @if (usuarioCorregir) {
                <!-- fase-14-12: el motivo aplica a la próxima quita de este bloque. -->
                <input
                  type="text"
                  [(ngModel)]="motivoCorreccion"
                  maxlength="200"
                  placeholder="Motivo (opcional) — lo ve el integrante"
                  class="mt-2 campo"
                />

                @if (cargandoCorreccion()) {
                  <p class="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">Cargando…</p>
                } @else if (completadas().length === 0) {
                  <p class="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Este usuario no tiene opcionales completadas en la sesión.
                  </p>
                } @else {
                  <ul class="mt-3 space-y-2">
                    @for (c of completadas(); track c.actividadId) {
                      <li class="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{{ c.nombre }}</p>
                          <p class="text-xs text-slate-500 dark:text-slate-400">
                            {{ c.registros.length }}× · +{{ c.valorPuntos }} c/u
                          </p>
                        </div>
                        <button
                          type="button"
                          (click)="quitarUna(c)"
                          [disabled]="procesando()"
                          class="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-slate-300 text-lg font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          aria-label="Quitar una"
                          title="Quitar una"
                        >
                          −
                        </button>
                        <button
                          type="button"
                          (click)="quitarTodas(c)"
                          [disabled]="procesando()"
                          class="flex-none rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-500/10"
                        >
                          Quitar todas
                        </button>
                      </li>
                    }
                  </ul>
                }

                <!-- Marcas rojas de hoy, con su botón de deshacer (fase-14-12) -->
                @if (marcas().length > 0) {
                  <div class="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                    <h4 class="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                      Marcas de hoy
                    </h4>
                    <ul class="mt-2 space-y-2">
                      @for (m of marcas(); track m.registroId) {
                        <li class="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/20">
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {{ m.nombre }}
                            </p>
                            <p class="text-xs text-red-600 dark:text-red-400">
                              {{ m.tipo === 'NO_HIZO' ? 'No hizo' : 'Repetición quitada' }}
                              @if (m.puntos !== 0) {
                                · {{ m.puntos }} pts
                              }
                            </p>
                            @if (m.motivoTutor) {
                              <p class="truncate text-xs italic text-slate-500 dark:text-slate-400">
                                «{{ m.motivoTutor }}»
                              </p>
                            }
                          </div>
                          <button
                            type="button"
                            (click)="deshacerMarca(m)"
                            [disabled]="procesando()"
                            class="flex-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Deshacer
                          </button>
                        </li>
                      }
                    </ul>
                  </div>
                }
              }
            </div>
          } @else {
            <p class="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              No hay una sesión abierta. Abrí la siguiente para registrar.
            </p>
          }
        }

        <!-- Controles de la sección -->
        <div class="mt-4 tarjeta">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">Controles</h3>
          <div class="mt-3 flex flex-wrap gap-2">
            @if (seccion()!.estado === 'ABIERTA') {
              @if (sesionAbierta()) {
                <button
                  type="button"
                  (click)="confirmar.set('cierre-sesion')"
                  class="boton boton-neutro"
                >
                  Cerrar sesión abierta
                </button>
              } @else {
                <button
                  type="button"
                  (click)="abrirSiguienteSesion()"
                  [disabled]="procesando()"
                  class="boton boton-neutro"
                >
                  Abrir siguiente sesión
                </button>
              }
              <button
                type="button"
                (click)="confirmar.set('evaluacion')"
                class="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
              >
                Forzar evaluación
              </button>
            }
            @if (seccion()!.estado === 'EVALUACION') {
              <button
                type="button"
                (click)="irAEvaluacion()"
                class="boton boton-primario"
              >
                Ver panel de evaluación
              </button>
              <button
                type="button"
                (click)="confirmar.set('cerrar-seccion')"
                class="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                Cerrar sección
              </button>
            }
          </div>
        </div>
      }
    </section>

    <ui-confirm-dialog
      [abierto]="confirmar() !== null"
      [titulo]="tituloConfirm()"
      [mensaje]="mensajeConfirm()"
      [textoConfirmar]="textoConfirm()"
      [tono]="confirmar() === 'cerrar-seccion' ? 'peligro' : 'primario'"
      (confirmar)="ejecutarConfirmado()"
      (cancelar)="confirmar.set(null)"
    />
  `,
})
export class PanelOperativoPage {
  readonly grupoId = input.required<string>();

  private readonly session = inject(SessionApiService);

  private readonly activity = inject(ActivityApiService);

  private readonly identity = inject(IdentityApiService);

  private readonly toasts = inject(ToastService);

  private readonly router = inject(Router);

  private readonly route = inject(ActivatedRoute);

  protected readonly cargando = signal(true);

  protected readonly procesando = signal(false);

  protected readonly seccion = signal<SeccionConSesionesResponse | null>(null);

  protected readonly usuarios = signal<UsuarioDto[]>([]);

  protected readonly actividades = signal<ActividadDto[]>([]);

  protected readonly conductas = signal<ConductaDto[]>([]);

  protected readonly confirmar = signal<AccionConfirmable>(null);

  protected readonly pestanias: Array<{ valor: VistaPanel; etiqueta: string }> = [
    { valor: 'registrar', etiqueta: 'Registrar' },
    { valor: 'historial', etiqueta: 'Qué pasó hoy' },
  ];

  /** Arranca en lo que diga la URL: la pestaña es enlazable y sobrevive un F5. */
  protected readonly vista = signal<VistaPanel>(
    inject(ActivatedRoute).snapshot.queryParamMap.get('vista') === 'historial'
      ? 'historial'
      : 'registrar'
  );

  protected usuarioNoHizo = '';

  protected actividadNoHizo = '';

  protected usuarioConducta = '';

  protected conductaSel = '';

  protected usuarioCorregir = '';

  /** Notas opcionales del tutor (fase-14-12): las lee el integrante. */
  protected motivoNoHizo = '';

  protected motivoCorreccion = '';

  protected readonly completadas = signal<CompletadaOpcionalDto[]>([]);

  /** Marcas rojas vivas del usuario elegido, para poder deshacerlas. */
  protected readonly marcas = signal<MarcaRojaDto[]>([]);

  protected readonly cargandoCorreccion = signal(false);

  protected readonly sesionAbierta = computed(() =>
    this.seccion()?.sesiones.find((s) => s.estado === EstadoSesion.ABIERTA) ?? null
  );

  /** "No hizo" es solo para obligatorias — las opcionales se corrigen quitando. */
  protected readonly obligatorias = computed(() =>
    this.actividades().filter((actividad) => actividad.tipoPuntaje === 'OBLIGATORIA')
  );

  protected readonly tituloConfirm = computed(() => {
    switch (this.confirmar()) {
      case 'cierre-sesion':
        return 'Cerrar sesión';
      case 'evaluacion':
        return 'Forzar evaluación';
      case 'cerrar-seccion':
        return 'Cerrar sección';
      default:
        return '';
    }
  });

  protected readonly mensajeConfirm = computed(() => {
    switch (this.confirmar()) {
      case 'cierre-sesion':
        return 'Se cerrará la sesión abierta. ¿Continuar?';
      case 'evaluacion':
        return 'La sección pasará a evaluación y no se podrán registrar más actividades. ¿Continuar?';
      case 'cerrar-seccion':
        return 'La sección quedará cerrada definitivamente. ¿Continuar?';
      default:
        return '';
    }
  });

  protected readonly textoConfirm = computed(() => {
    switch (this.confirmar()) {
      case 'cierre-sesion':
        return 'Cerrar sesión';
      case 'evaluacion':
        return 'Forzar evaluación';
      case 'cerrar-seccion':
        return 'Cerrar sección';
      default:
        return 'Confirmar';
    }
  });

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  protected cambiarVista(vista: VistaPanel): void {
    this.vista.set(vista);
    // replaceUrl: cambiar de pestaña no debería llenar el historial del
    // navegador — el botón «atrás» tiene que salir de la pantalla, no ciclar.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { vista: vista === 'registrar' ? null : vista },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected iniciarSeccion(): void {
    this.procesando.set(true);
    this.session.iniciarSeccion(this.grupoId()).subscribe({
      next: (s) => {
        this.seccion.set(s);
        this.procesando.set(false);
        this.toasts.exito('Sección iniciada.');
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  protected abrirSiguienteSesion(): void {
    const s = this.seccion();

    if (!s) {
      return;
    }

    this.procesando.set(true);
    this.session.abrirSiguienteSesion(s.id).subscribe({
      next: () => {
        this.toasts.exito('Sesión abierta.');
        this.recargar();
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  protected registrarNoHizo(): void {
    // Se guarda antes de limpiar el form: si el usuario marcado es el que el
    // tutor está corrigiendo, hay que refrescar sus marcas al terminar.
    const usuarioMarcado = this.usuarioNoHizo;

    this.procesando.set(true);
    this.activity
      .registrarNoHizo(this.actividadNoHizo, usuarioMarcado, this.motivoNoHizo || undefined)
      .subscribe({
        next: () => {
          this.toasts.exito('«No hizo» registrado.');
          this.usuarioNoHizo = '';
          this.actividadNoHizo = '';
          this.motivoNoHizo = '';
          this.procesando.set(false);

          if (usuarioMarcado === this.usuarioCorregir) {
            this.cargarCompletadas();
          }
        },
        error: (e) => {
          this.toasts.error(mensajeDeError(e));
          this.procesando.set(false);
        },
      });
  }

  /** Deshace una marca roja: devuelve los puntos y limpia el rojo (fase-14-12). */
  protected deshacerMarca(marca: MarcaRojaDto): void {
    this.procesando.set(true);
    this.activity.revertirMarca(marca.registroId).subscribe({
      next: () => {
        this.toasts.exito(`Se deshizo la marca de «${marca.nombre}».`);
        this.procesando.set(false);
        this.cargarCompletadas();
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  protected registrarConducta(): void {
    this.procesando.set(true);
    this.activity.registrarConducta(this.conductaSel, this.usuarioConducta).subscribe({
      next: () => {
        this.toasts.exito('Conducta registrada.');
        this.usuarioConducta = '';
        this.conductaSel = '';
        this.procesando.set(false);
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  protected onUsuarioCorregirCambio(): void {
    this.completadas.set([]);
    this.marcas.set([]);
    this.motivoCorreccion = '';

    if (this.usuarioCorregir) {
      this.cargarCompletadas();
    }
  }

  protected quitarUna(completada: CompletadaOpcionalDto): void {
    const ultimo = completada.registros[completada.registros.length - 1];

    if (!ultimo) {
      return;
    }

    this.procesando.set(true);
    this.activity
      .eliminarRegistroActividad(ultimo.registroId, this.motivoCorreccion || undefined)
      .subscribe({
        next: () => {
          this.toasts.exito(`Se quitó una de «${completada.nombre}».`);
          this.procesando.set(false);
          this.cargarCompletadas();
        },
        error: (e) => {
          this.toasts.error(mensajeDeError(e));
          this.procesando.set(false);
        },
      });
  }

  protected quitarTodas(completada: CompletadaOpcionalDto): void {
    if (completada.registros.length === 0) {
      return;
    }

    const motivo = this.motivoCorreccion || undefined;

    this.procesando.set(true);
    forkJoin(
      completada.registros.map((registro) =>
        this.activity.eliminarRegistroActividad(registro.registroId, motivo)
      )
    ).subscribe({
      next: () => {
        this.toasts.exito(`Se quitaron todas las de «${completada.nombre}».`);
        this.procesando.set(false);
        this.cargarCompletadas();
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  /** Estado de corrección del usuario elegido: lo que hizo y lo que ya se le marcó. */
  private cargarCompletadas(): void {
    if (!this.usuarioCorregir) {
      return;
    }

    this.cargandoCorreccion.set(true);
    forkJoin({
      completadas: this.activity.completadasOpcionales(this.grupoId(), this.usuarioCorregir),
      marcas: this.activity.marcasRojas(this.grupoId(), this.usuarioCorregir),
    }).subscribe({
      next: ({ completadas, marcas }) => {
        this.completadas.set(completadas);
        this.marcas.set(marcas);
        this.cargandoCorreccion.set(false);
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.cargandoCorreccion.set(false);
      },
    });
  }

  protected ejecutarConfirmado(): void {
    const accion = this.confirmar();
    const s = this.seccion();
    this.confirmar.set(null);

    if (!s) {
      return;
    }

    if (accion === 'cierre-sesion') {
      const abierta = this.sesionAbierta();

      if (!abierta) {
        return;
      }

      this.ejecutar(this.session.forzarCierreSesion(s.id, abierta.id), 'Sesión cerrada.');
    } else if (accion === 'evaluacion') {
      this.ejecutar(this.session.forzarEvaluacion(s.id), 'Sección en evaluación.');
    } else if (accion === 'cerrar-seccion') {
      this.ejecutar(this.session.cerrarSeccion(s.id), 'Sección cerrada.');
    }
  }

  protected irAEvaluacion(): void {
    const s = this.seccion();

    if (s) {
      void this.router.navigate(['/grupos', this.grupoId(), 'secciones', s.id, 'evaluacion']);
    }
  }

  private ejecutar(peticion: Observable<unknown>, ok: string): void {
    this.procesando.set(true);
    peticion.subscribe({
      next: () => {
        this.toasts.exito(ok);
        this.recargar();
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  /** Recarga la Sección completa (con sus sesiones) tras una mutación. */
  private recargar(): void {
    this.session.seccionActual(this.grupoId()).subscribe({
      next: (seccion) => {
        this.seccion.set(seccion);
        this.procesando.set(false);
      },
      error: () => this.procesando.set(false),
    });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);
    forkJoin({
      seccion: this.session.seccionActual(grupoId),
      usuarios: this.identity.listarUsuarios(grupoId),
      actividades: this.activity.listarActividades(grupoId, 'ACTIVA'),
      conductas: this.activity.listarConductas(grupoId, 'ACTIVA'),
    }).subscribe({
      next: ({ seccion, usuarios, actividades, conductas }) => {
        this.seccion.set(seccion);
        this.usuarios.set(usuarios);
        this.actividades.set(actividades);
        this.conductas.set(conductas);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
