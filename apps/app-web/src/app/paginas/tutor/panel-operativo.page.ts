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
  type MiEstadoActividadHoyDto,
  type UsuarioDto,
} from '@dorado/shared-types';
import {
  CampoComponent,
  ConfirmDialogComponent,
  EstadoSeccionBadgeComponent,
  EstadoVacioComponent,
} from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import type { SeccionConSesionesResponse } from '../../core/api/api.types';
import { mensajeDeError } from '../../core/api/errores';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { SessionApiService } from '../../core/api/session-api.service';
import {
  filasDeRegistro,
  textoDeRepeticiones,
  type FilaRegistro,
} from '../../core/registro-tutor';
import { HistorialSesionComponent } from './historial-sesion.component';

type AccionConfirmable =
  | 'cierre-sesion'
  | 'evaluacion'
  | 'cerrar-seccion'
  // fase-14-23 T4: el motivo del tutor se pide en la confirmación.
  | 'no-hizo'
  | 'quitar'
  | null;

/** fase-14-18: «Registrar» es lo de siempre; «historial» es la línea de tiempo. */
type VistaPanel = 'registrar' | 'historial';

/** Panel operativo del día a día (fase-10): acciones rápidas del tutor sobre la Sección actual. */
@Component({
  selector: 'app-panel-operativo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    EncabezadoPaginaComponent,
    HistorialSesionComponent,
    EstadoSeccionBadgeComponent,
    ConfirmDialogComponent,
    EstadoVacioComponent,
    CampoComponent,
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
            <span class="text-xs text-slate-400 dark:text-slate-500">
              {{ seccion()!.sesiones.length }}
              {{ seccion()!.sesiones.length === 1 ? 'sesión' : 'sesiones' }}
            </span>
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

        <!-- ===== Registrar: un flujo POR PERSONA (fase-14-23 T4) =====
             Antes eran tres formularios apilados con la misma forma («elegí
             usuario → elegí ítem → Registrar»), y había que volver a elegir a
             la misma persona en cada uno. Ahora se elige una vez y todo lo de
             abajo es de ella. -->
        @if (seccion()!.estado === 'ABIERTA') {
          @if (sesionAbierta()) {
            <div class="mt-4 flex flex-wrap gap-2">
              @for (u of usuarios(); track u.id) {
                <button
                  type="button"
                  (click)="elegirUsuario(u.id)"
                  [attr.aria-pressed]="usuarioSel() === u.id"
                  class="rounded-xl px-4 py-2 text-sm font-semibold transition"
                  [class]="
                    usuarioSel() === u.id
                      ? 'bg-marca-600 text-white'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                  "
                >
                  {{ u.nombre }}
                </button>
              }
            </div>

            @if (usuarioSel()) {
              <div class="mt-3 tarjeta animate-fade-in">
                @if (cargandoUsuario()) {
                  <p class="py-6 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
                } @else {
                  <!-- Su lista de hoy: la MISMA que ve el integrante -->
                  @if (filas().length === 0) {
                    <p class="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Hoy no tiene ninguna actividad a la vista.
                    </p>
                  } @else {
                    <ul class="divide-y divide-slate-100 dark:divide-slate-800">
                      @for (f of filas(); track f.actividadId) {
                        <li class="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 first:pt-0">
                          <span class="min-w-0 flex-1">
                            <span
                              class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100"
                              [class.opacity-50]="f.motivoBloqueo !== null"
                            >
                              {{ f.nombre }}
                            </span>
                            <span class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                              <span>{{ f.tipoPuntaje === 'OBLIGATORIA' ? 'Obligatoria' : 'Opcional' }}</span>
                              @if (repeticiones(f)) {
                                <span>· {{ repeticiones(f) }}</span>
                              }
                              @if (f.motivoBloqueo) {
                                <span class="font-medium text-amber-600 dark:text-amber-400">
                                  · {{ f.motivoBloqueo }}
                                </span>
                              }
                            </span>
                          </span>

                          <span class="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              (click)="marcarHizo(f)"
                              [disabled]="procesando() || !f.puedeCompletar"
                              class="boton boton-sm bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                              ✓ hizo
                            </button>
                            @if (f.puedeNoHizo) {
                              <button
                                type="button"
                                (click)="pedirNoHizo(f)"
                                [disabled]="procesando()"
                                class="boton boton-neutro boton-sm"
                              >
                                ✗ no hizo
                              </button>
                            }
                            @if (f.puedeQuitar) {
                              <button
                                type="button"
                                (click)="pedirQuitar(f)"
                                [disabled]="procesando()"
                                class="boton boton-peligro boton-sm"
                                aria-label="Quitar una"
                                title="Quitar una repetición"
                              >
                                −
                              </button>
                            }
                          </span>
                        </li>
                      }
                    </ul>
                  }

                  <!-- Marcas rojas de hoy, con su deshacer (fase-14-12) -->
                  @if (marcas().length > 0) {
                    <div class="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <h4 class="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                        Marcas de hoy
                      </h4>
                      <ul class="mt-2 space-y-1.5">
                        @for (m of marcas(); track m.registroId) {
                          <li class="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/60 px-3 py-2 dark:border-red-900 dark:bg-red-950/20">
                            <span class="min-w-0 flex-1">
                              <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                                {{ m.nombre }}
                              </span>
                              <span class="text-xs text-red-600 dark:text-red-400">
                                {{ m.tipo === 'NO_HIZO' ? 'No hizo' : 'Repetición quitada' }}
                                @if (m.puntos !== 0) {
                                  · {{ m.puntos }} pts
                                }
                                @if (m.motivoTutor) {
                                  · «{{ m.motivoTutor }}»
                                }
                              </span>
                            </span>
                            <button
                              type="button"
                              (click)="deshacerMarca(m)"
                              [disabled]="procesando()"
                              class="boton boton-neutro boton-sm shrink-0"
                            >
                              Deshacer
                            </button>
                          </li>
                        }
                      </ul>
                    </div>
                  }

                  <!-- Conducta rápida: el único ítem que no está en la lista -->
                  <div class="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <ui-campo etiqueta="Conducta" class="min-w-48 flex-1">
                      <select [(ngModel)]="conductaSel" class="campo">
                        <option value="">Elegí una…</option>
                        @for (c of conductas(); track c.id) {
                          <option [value]="c.id">
                            {{ c.nombre }} ({{ c.tipo === 'BUENA' ? '+' : '−' }}{{ c.valorPuntos }})
                          </option>
                        }
                      </select>
                    </ui-campo>
                    <button
                      type="button"
                      (click)="registrarConducta()"
                      [disabled]="procesando() || !conductaSel"
                      class="boton boton-primario"
                    >
                      Registrar
                    </button>
                  </div>
                }
              </div>
            } @else {
              <p class="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Elegí a quién le vas a registrar algo.
              </p>
            }
          } @else {
            <p class="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              No hay una sesión abierta. Abrí la siguiente para registrar.
            </p>
          }
        }

        <!-- Ritmo de la semana. Antes se llamaba «Controles» —un título que no
             dice qué hacen— y «Forzar evaluación» tenía el mismo peso que
             cerrar la sesión, siendo irreversible. -->
        <div class="mt-4 tarjeta">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">Ritmo de la semana</h3>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            @if (seccion()!.estado === 'ABIERTA') {
              @if (sesionAbierta()) {
                <button
                  type="button"
                  (click)="confirmar.set('cierre-sesion')"
                  class="boton boton-neutro"
                >
                  Cerrar la sesión de hoy
                </button>
              } @else {
                <button
                  type="button"
                  (click)="abrirSiguienteSesion()"
                  [disabled]="procesando()"
                  class="boton boton-primario"
                >
                  Abrir la sesión de hoy
                </button>
              }
              <button
                type="button"
                (click)="confirmar.set('evaluacion')"
                class="boton boton-peligro text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
              >
                Pasar a evaluación
              </button>
              <span class="text-xs text-slate-400 dark:text-slate-500">
                Pasar a evaluación cierra la semana para registrar. No se puede volver atrás.
              </span>
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
                class="boton boton-peligro"
              >
                Cerrar sección
              </button>
            }
          </div>
        </div>
      }
    </section>

    <!-- El motivo del tutor (fase-14-12) se pide acá y no en un campo suelto:
         antes quedaba escrito de una marca a la siguiente. Es OPCIONAL, así que
         el diálogo no lo exige para confirmar. -->
    <ui-confirm-dialog
      [abierto]="confirmar() !== null"
      [titulo]="tituloConfirm()"
      [mensaje]="mensajeConfirm()"
      [textoConfirmar]="textoConfirm()"
      [tono]="confirmar() === 'cerrar-seccion' || confirmPideMotivo() ? 'peligro' : 'primario'"
      [pideMotivo]="confirmPideMotivo()"
      placeholderMotivo="Motivo (opcional) — lo lee el integrante"
      (confirmar)="ejecutarConfirmado($event)"
      (cancelar)="cerrarConfirmacion()"
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

  protected conductaSel = '';

  /** fase-14-23 T4: se elige UNA vez y vale para todo lo de abajo. */
  protected readonly usuarioSel = signal<string | null>(null);

  protected readonly cargandoUsuario = signal(false);

  /** Su lista de hoy, tal cual la ve él (misma función del backend). */
  protected readonly estadoHoy = signal<MiEstadoActividadHoyDto[]>([]);

  /** La fila sobre la que está preguntando el diálogo de confirmación. */
  protected readonly filaEnJuego = signal<FilaRegistro | null>(null);

  /** Lo completado del integrante elegido: de acá salen los registroId a quitar. */
  protected readonly completadas = signal<CompletadaOpcionalDto[]>([]);

  /** Marcas rojas vivas del usuario elegido, para poder deshacerlas. */
  protected readonly marcas = signal<MarcaRojaDto[]>([]);

  protected readonly sesionAbierta = computed(() =>
    this.seccion()?.sesiones.find((s) => s.estado === EstadoSesion.ABIERTA) ?? null
  );

  /** Las filas del integrante elegido: su estado de hoy + el nombre del catálogo. */
  protected readonly filas = computed<FilaRegistro[]>(() => {
    const usuarioId = this.usuarioSel();

    return usuarioId ? filasDeRegistro(this.estadoHoy(), this.actividades(), usuarioId) : [];
  });

  /** Las dos acciones que dejan rastro para el integrante piden motivo. */
  protected readonly confirmPideMotivo = computed(
    () => this.confirmar() === 'no-hizo' || this.confirmar() === 'quitar'
  );

  protected readonly tituloConfirm = computed(() => {
    switch (this.confirmar()) {
      case 'cierre-sesion':
        return 'Cerrar la sesión de hoy';
      case 'evaluacion':
        return 'Pasar a evaluación';
      case 'cerrar-seccion':
        return 'Cerrar la semana';
      case 'no-hizo':
        return `Marcar «${this.filaEnJuego()?.nombre ?? ''}» como no hecha`;
      case 'quitar':
        return `Quitar una de «${this.filaEnJuego()?.nombre ?? ''}»`;
      default:
        return '';
    }
  });

  protected readonly mensajeConfirm = computed(() => {
    switch (this.confirmar()) {
      case 'cierre-sesion':
        return 'Se cerrará la sesión abierta. ¿Continuar?';
      case 'evaluacion':
        return 'La sección pasa a evaluación y no se podrán registrar más actividades. No se puede volver atrás.';
      case 'cerrar-seccion':
        return 'La sección quedará cerrada definitivamente. ¿Continuar?';
      case 'no-hizo':
        return 'Le resta los puntos y le quema el intento del día. El motivo lo va a leer en su pantalla.';
      case 'quitar':
        return 'Le resta los puntos y ese intento se le gasta: solo vos podés devolvérselo. El motivo lo va a leer en su pantalla.';
      default:
        return '';
    }
  });

  protected readonly textoConfirm = computed(() => {
    switch (this.confirmar()) {
      case 'cierre-sesion':
        return 'Cerrar la sesión';
      case 'evaluacion':
        return 'Pasar a evaluación';
      case 'cerrar-seccion':
        return 'Cerrar la semana';
      case 'no-hizo':
        return 'Marcar no hecha';
      case 'quitar':
        return 'Quitar una';
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

  /**
   * Marca «hizo» por el integrante — fase-14-23 T4.
   *
   * El endpoint ya lo permitía (`@Roles(USUARIO, TUTOR, ORG_ADMIN)`) y el
   * cliente ya tenía el parámetro; lo que faltaba era la pantalla. Queda en el
   * historial con el Tutor como quien registró.
   */
  protected marcarHizo(fila: FilaRegistro): void {
    const usuarioId = this.usuarioSel();

    if (!usuarioId || !fila.puedeCompletar) {
      return;
    }

    this.procesando.set(true);
    this.activity.completarActividad(fila.actividadId, usuarioId).subscribe({
      next: () => {
        this.toasts.exito(`«${fila.nombre}» marcada.`);
        this.procesando.set(false);
        this.cargarUsuario();
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  /**
   * El motivo del «no hizo» y del «quitar» se pide en la confirmación y no en
   * un campo suelto del formulario: antes el texto quedaba escrito de una marca
   * a la siguiente y era fácil mandarlo pegado a la equivocada.
   */
  protected pedirNoHizo(fila: FilaRegistro): void {
    this.filaEnJuego.set(fila);
    this.confirmar.set('no-hizo');
  }

  protected pedirQuitar(fila: FilaRegistro): void {
    this.filaEnJuego.set(fila);
    this.confirmar.set('quitar');
  }

  private registrarNoHizo(fila: FilaRegistro, motivo: string): void {
    const usuarioId = this.usuarioSel();

    if (!usuarioId) {
      return;
    }

    this.procesando.set(true);
    this.activity
      .registrarNoHizo(fila.actividadId, usuarioId, motivo || undefined)
      .subscribe({
        next: () => {
          this.toasts.exito(`«${fila.nombre}» marcada como no hecha.`);
          this.procesando.set(false);
          this.cargarUsuario();
        },
        error: (e) => {
          this.toasts.error(mensajeDeError(e));
          this.procesando.set(false);
        },
      });
  }

  /** Quita la última repetición de una opcional (fase-14-12). */
  private quitarUna(fila: FilaRegistro, motivo: string): void {
    const completada = this.completadas().find((c) => c.actividadId === fila.actividadId);
    const ultimo = completada?.registros[completada.registros.length - 1];

    if (!ultimo) {
      return;
    }

    this.procesando.set(true);
    this.activity.eliminarRegistroActividad(ultimo.registroId, motivo || undefined).subscribe({
      next: () => {
        this.toasts.exito(`Se quitó una de «${fila.nombre}».`);
        this.procesando.set(false);
        this.cargarUsuario();
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
        this.cargarUsuario();
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  protected registrarConducta(): void {
    const usuarioId = this.usuarioSel();

    if (!usuarioId || !this.conductaSel) {
      return;
    }

    this.procesando.set(true);
    this.activity.registrarConducta(this.conductaSel, usuarioId).subscribe({
      next: () => {
        this.toasts.exito('Conducta registrada.');
        this.conductaSel = '';
        this.procesando.set(false);
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  protected cerrarConfirmacion(): void {
    this.confirmar.set(null);
    this.filaEnJuego.set(null);
  }

  protected elegirUsuario(usuarioId: string): void {
    this.usuarioSel.set(this.usuarioSel() === usuarioId ? null : usuarioId);
    this.estadoHoy.set([]);
    this.completadas.set([]);
    this.marcas.set([]);

    if (this.usuarioSel()) {
      this.cargarUsuario();
    }
  }

  protected repeticiones(fila: FilaRegistro): string {
    return textoDeRepeticiones(fila);
  }

  /**
   * Todo lo del integrante elegido en una sola tanda: su lista de hoy (la misma
   * que ve él), lo que tiene completado y sus marcas rojas vivas.
   */
  private cargarUsuario(): void {
    const usuarioId = this.usuarioSel();

    if (!usuarioId) {
      return;
    }

    this.cargandoUsuario.set(true);
    forkJoin({
      estado: this.activity.estadoHoyDeUsuario(this.grupoId(), usuarioId),
      completadas: this.activity.completadasOpcionales(this.grupoId(), usuarioId),
      marcas: this.activity.marcasRojas(this.grupoId(), usuarioId),
    }).subscribe({
      next: ({ estado, completadas, marcas }) => {
        this.estadoHoy.set(estado.actividades);
        this.completadas.set(completadas);
        this.marcas.set(marcas);
        this.cargandoUsuario.set(false);
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.cargandoUsuario.set(false);
      },
    });
  }

  protected ejecutarConfirmado(motivo: string): void {
    const accion = this.confirmar();
    const fila = this.filaEnJuego();
    const s = this.seccion();
    this.confirmar.set(null);
    this.filaEnJuego.set(null);

    // Las dos que operan sobre una fila no necesitan la Sección: van primero.
    if (accion === 'no-hizo' && fila) {
      this.registrarNoHizo(fila, motivo);

      return;
    }

    if (accion === 'quitar' && fila) {
      this.quitarUna(fila, motivo);

      return;
    }

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
