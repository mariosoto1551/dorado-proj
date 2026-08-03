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
import { forkJoin } from 'rxjs';

import {
  type EquipoDto,
  type RegistroTareaEquipoDto,
  type TareaEquipoDeHoyDto,
  type UsuarioDto,
} from '@dorado/shared-types';
import { ConfirmDialogComponent, EstadoVacioComponent, CampoComponent, ModalComponent } from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { ScoringApiService } from '../../core/api/scoring-api.service';
import { mensajeDeError } from '../../core/api/errores';

/** Equipos de trabajo del grupo (fase-14-09): crear, jefe, integrantes, puntaje. */
@Component({
  selector: 'app-equipos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, CampoComponent, EstadoVacioComponent, FormsModule, EncabezadoPaginaComponent, ConfirmDialogComponent],
  template: `
    <section class="mx-auto max-w-3xl px-4 py-6">
      <app-encabezado-pagina
        titulo="Equipos"
        subtitulo="Agrupá participantes con un jefe que impulsa las tareas del equipo."
      />

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else {
        <button
          type="button"
          (click)="abrirCrear()"
          [disabled]="disponibles().length === 0"
          class="mt-5 flex w-full items-center justify-center gap-2 boton boton-primario rounded-2xl py-3"
        >
          ＋ Nuevo equipo
        </button>
        @if (disponibles().length === 0 && equipos().length > 0) {
          <p class="mt-2 text-center text-xs text-slate-400 dark:text-slate-500">
            Todos los participantes ya están en un equipo.
          </p>
        }

        @if (equipos().length === 0) {
          <ui-estado-vacio class="mt-4">
            Todavía no hay equipos en este grupo.
          </ui-estado-vacio>
        } @else {
          <ul class="mt-4 space-y-3">
            @for (e of equipos(); track e.id) {
              <li class="tarjeta">
                <div class="flex items-center gap-3">
                  <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-lg dark:bg-amber-500/20">🛡️</span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-bold text-slate-900 dark:text-white">{{ e.nombre }}</p>
                    <p class="text-xs text-slate-400 dark:text-slate-500">
                      {{ e.miembros.length }} integrante{{ e.miembros.length === 1 ? '' : 's' }} ·
                      jefe: {{ nombreDe(e.jefeUsuarioId) }}
                    </p>
                  </div>
                  <span class="rounded-lg bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-600 tabular-nums dark:bg-emerald-500/10 dark:text-emerald-400">
                    {{ puntajes()[e.id] ?? '·' }}
                  </span>
                </div>

                <div class="mt-3 flex flex-wrap gap-1.5">
                  @for (m of e.miembros; track m.usuarioId) {
                    <span
                      class="rounded-full px-2.5 py-1 text-xs font-semibold"
                      [class]="m.rol === 'JEFE'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'"
                    >
                      @if (m.rol === 'JEFE') { ★ }{{ m.nombre }}
                    </span>
                  }
                </div>

                <!-- fase-14-23 T4·2ª: dos botones donde antes había cuatro. «Sustituir
                     jefe» e «Integrantes» eran dos modales para la misma pregunta —quién
                     está en el equipo y quién manda—, y Archivar iba en la misma fila con
                     el mismo peso siendo el único sin vuelta atrás. -->
                <div class="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" (click)="abrirMiembros(e)" class="boton boton-neutro boton-sm">
                    Quiénes están
                  </button>
                  <button type="button" (click)="alternarTareas(e)" class="boton boton-neutro boton-sm">
                    {{ equipoAbierto() === e.id ? 'Ocultar tareas' : 'Tareas de hoy' }}
                  </button>
                  <button
                    type="button"
                    (click)="pedirArchivar(e)"
                    class="ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
                  >
                    Archivar
                  </button>
                </div>

                <!-- Tareas de hoy: anular una completada o deshacer la anulación (fase-14-13) -->
                @if (equipoAbierto() === e.id) {
                  <div class="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                    @if (cargandoTareas()) {
                      <p class="text-center text-xs text-slate-400 dark:text-slate-500">Cargando…</p>
                    } @else {
                      <p class="text-xs text-slate-500 dark:text-slate-400">
                        Anular le saca los puntos a todo el equipo, bono del jefe incluido, y le quema
                        el intento del día. Solo vos podés devolverlo.
                      </p>

                      @if (completadasDeHoy().length === 0) {
                        <p class="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          Este equipo no marcó ninguna tarea en la sesión abierta.
                        </p>
                      } @else {
                        <ul class="mt-2 space-y-2">
                          @for (fila of completadasDeHoy(); track fila.registro.registroTareaEquipoId) {
                            <li
                              class="flex items-center gap-3 rounded-xl border p-3"
                              [class]="fila.registro.eliminado
                                ? 'border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20'
                                : 'border-slate-200 dark:border-slate-800'"
                            >
                              <div class="min-w-0 flex-1">
                                <p class="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                                  {{ fila.nombre }}
                                </p>
                                <p class="text-xs" [class]="fila.registro.eliminado ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'">
                                  {{ fila.registro.eliminado ? 'Anulada' : '+' + fila.valorPuntos + ' c/u' }}
                                </p>
                                @if (fila.registro.motivoTutor) {
                                  <p class="truncate text-xs italic text-slate-500 dark:text-slate-400">
                                    «{{ fila.registro.motivoTutor }}»
                                  </p>
                                }
                              </div>
                              @if (fila.registro.eliminado) {
                                <button
                                  type="button"
                                  (click)="deshacer(e, fila.registro)"
                                  [disabled]="procesando()"
                                  class="flex-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  Deshacer
                                </button>
                              } @else {
                                <button
                                  type="button"
                                  (click)="pedirAnular(e, fila.registro)"
                                  [disabled]="procesando()"
                                  class="boton boton-peligro boton-sm flex-none"
                                >
                                  Anular
                                </button>
                              }
                            </li>
                          }
                        </ul>
                      }
                    }
                  </div>
                }
              </li>
            }
          </ul>
        }
      }
    </section>

    <!-- Modal crear equipo -->
    <ui-modal [abierto]="creando()" titulo="Nuevo equipo" ancho="sm" (cerrar)="creando.set(false)">
      @if (creando()) {
        <form (submit)="crear($event)">
            <ui-campo etiqueta="Nombre" class="mt-4">
              <input [(ngModel)]="nombre" name="nombre" required maxlength="120" placeholder="Equipo Fénix" class="campo" />
            </ui-campo>
            <ui-campo etiqueta="Jefe del equipo" class="mt-4">
              <select [(ngModel)]="jefeId" name="jefe" required class="campo">
                <option value="" disabled>Elegí un participante…</option>
                @for (u of disponibles(); track u.id) {
                  <option [value]="u.id">{{ u.nombre }}</option>
                }
              </select>
            </ui-campo>
            <fieldset class="mt-4">
              <legend class="etiqueta-campo">Integrantes</legend>
              <div class="mt-2 space-y-1.5">
                @for (u of disponibles(); track u.id) {
                  @if (u.id !== jefeId) {
                    <label class="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                      <input type="checkbox" [checked]="miembrosSel().has(u.id)" (change)="alternarMiembro(u.id)" class="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500" />
                      <span class="text-slate-800 dark:text-slate-100">{{ u.nombre }}</span>
                    </label>
                  }
                }
              </div>
            </fieldset>
          <div class="botonera">
            <button type="button" (click)="creando.set(false)" class="boton boton-neutro">Cancelar</button>
            <button type="submit" [disabled]="guardando() || jefeId === ''" class="boton boton-primario">Crear equipo</button>
          </div>
        </form>
      }
    </ui-modal>

    <!-- fase-14-23 T4·2ª: UN modal donde había dos. «Sustituir jefe» era un
         select con un submit propio para algo que acá es un botón en la fila de
         la persona; separarlo obligaba a abrir dos veces para armar el equipo. -->
    <ui-modal
      [abierto]="editandoMiembros() !== null"
      [titulo]="'Quiénes están · ' + (editandoMiembros()?.nombre ?? '')"
      subtitulo="El jefe es quien completa las tareas del equipo. Al cambiarlo, el anterior pasa a integrante."
      ancho="sm"
      (cerrar)="editandoMiembros.set(null)"
    >
      @if (editandoMiembros(); as e) {
        <ul class="mt-3 space-y-1.5">
          @for (m of e.miembros; track m.usuarioId) {
            <li class="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              <span class="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">{{ m.nombre }}</span>
              @if (m.rol === 'JEFE') {
                <span class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                  ★ Jefe
                </span>
              } @else {
                <button
                  type="button"
                  (click)="hacerJefe(e, m.usuarioId)"
                  [disabled]="guardando()"
                  class="boton boton-neutro boton-sm shrink-0"
                >
                  Hacer jefe
                </button>
                <button
                  type="button"
                  (click)="pedirQuitarMiembro(e, m)"
                  [disabled]="guardando()"
                  class="boton boton-peligro boton-sm shrink-0"
                >
                  Quitar
                </button>
              }
            </li>
          }
        </ul>

        @if (disponibles().length > 0) {
          <div class="mt-4 flex gap-2">
            <select [(ngModel)]="agregarId" name="agregar" class="flex-1 campo">
              <option value="">Agregar integrante…</option>
              @for (u of disponibles(); track u.id) {
                <option [value]="u.id">{{ u.nombre }}</option>
              }
            </select>
            <button
              type="button"
              (click)="agregarMiembro(e)"
              [disabled]="guardando() || agregarId === ''"
              class="boton boton-primario"
            >
              Agregar
            </button>
          </div>
        }

        <div class="botonera">
          <button type="button" (click)="editandoMiembros.set(null)" class="boton boton-neutro">
            Listo
          </button>
        </div>
      }
    </ui-modal>

    <!-- fase-14-23 T4·2ª: las tres acciones sin vuelta atrás de esta pantalla
         pasan por acá. El motivo de anular se pide en el diálogo y no en un
         campo permanente, que además era uno solo para todos los equipos: se
         escribía para uno y seguía ahí al abrir el de otro. -->
    <ui-confirm-dialog
      [abierto]="confirmar() !== null"
      [titulo]="tituloConfirm()"
      [mensaje]="mensajeConfirm()"
      [textoConfirmar]="textoConfirm()"
      [pideMotivo]="confirmar() === 'anular-tarea'"
      placeholderMotivo="Motivo (opcional) — lo ve el equipo"
      (confirmar)="ejecutarConfirmado($event)"
      (cancelar)="cerrarConfirmacion()"
    />
  `,
})
export class EquiposPage {
  readonly grupoId = input.required<string>();

  private readonly identity = inject(IdentityApiService);

  private readonly activity = inject(ActivityApiService);

  private readonly scoring = inject(ScoringApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly equipos = signal<EquipoDto[]>([]);

  protected readonly usuarios = signal<UsuarioDto[]>([]);

  // El mapa es disperso mientras los puntajes van llegando de a uno, así que el
  // tipo lo dice: `puntajes()[id]` puede no estar todavía (el `?? '·'` del
  // template es real, no redundante — NG8102).
  protected readonly puntajes = signal<Record<string, number | undefined>>({});

  protected readonly guardando = signal(false);

  // Modales
  protected readonly creando = signal(false);

  protected readonly editandoMiembros = signal<EquipoDto | null>(null);

  // Formularios (ngModel)
  protected nombre = '';

  protected jefeId = '';

  protected readonly miembrosSel = signal<Set<string>>(new Set());

  protected agregarId = '';

  /** Participantes activos del grupo que no están en ningún equipo. */
  protected readonly disponibles = signal<UsuarioDto[]>([]);

  // --- Anular tareas de equipo (fase-14-13) ---

  /** Equipo cuyo bloque "Tareas de hoy" está desplegado; null = ninguno. */
  protected readonly equipoAbierto = signal<string | null>(null);

  protected readonly cargandoTareas = signal(false);

  protected readonly procesando = signal(false);

  private readonly tareasDeHoy = signal<TareaEquipoDeHoyDto[]>([]);

  // --- Confirmación de lo que no tiene vuelta atrás (fase-14-23 T4·2ª) ---

  /**
   * Las tres acciones sin regreso de esta pantalla. `archivar` ya confirmaba;
   * las otras dos se ejecutaban con un clic, y la de anular además le saca los
   * puntos a todo el equipo y le quema el intento del día.
   */
  protected readonly confirmar = signal<'archivar' | 'anular-tarea' | 'quitar-miembro' | null>(
    null
  );

  /** El equipo y la fila sobre los que está preguntando el diálogo. */
  private readonly equipoEnJuego = signal<EquipoDto | null>(null);

  private readonly registroEnJuego = signal<RegistroTareaEquipoDto | null>(null);

  private readonly miembroEnJuego = signal<{ usuarioId: string; nombre: string } | null>(null);

  protected readonly tituloConfirm = computed(() => {
    switch (this.confirmar()) {
      case 'archivar':
        return 'Archivar equipo';
      case 'anular-tarea':
        return 'Anular la tarea del equipo';
      case 'quitar-miembro':
        return `Quitar a ${this.miembroEnJuego()?.nombre ?? ''} del equipo`;
      default:
        return '';
    }
  });

  protected readonly mensajeConfirm = computed(() => {
    switch (this.confirmar()) {
      case 'archivar':
        return `«${this.equipoEnJuego()?.nombre ?? ''}» dejará de aparecer para sus integrantes.`;
      case 'anular-tarea':
        return 'Le saca los puntos a todo el equipo, bono del jefe incluido, y le quema el intento del día. Solo vos podés devolvérselo.';
      case 'quitar-miembro':
        return 'Deja de ver las tareas del equipo. Los puntos que ya sumó no se tocan.';
      default:
        return '';
    }
  });

  protected readonly textoConfirm = computed(() => {
    switch (this.confirmar()) {
      case 'archivar':
        return 'Archivar';
      case 'anular-tarea':
        return 'Anular';
      case 'quitar-miembro':
        return 'Quitar';
      default:
        return 'Confirmar';
    }
  });

  /**
   * Las completadas del equipo en la sesión abierta, aplanadas: el Tutor opera
   * sobre filas, no sobre actividades. Vivas primero, anuladas después.
   */
  protected readonly completadasDeHoy = computed(() =>
    this.tareasDeHoy()
      .flatMap((tarea) =>
        tarea.registros.map((registro) => ({
          nombre: tarea.nombre,
          valorPuntos: tarea.valorPuntos,
          registro,
        }))
      )
      .sort((a, b) => Number(a.registro.eliminado) - Number(b.registro.eliminado))
  );

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  /** Despliega (o cierra) el bloque de tareas de hoy de un equipo. */
  protected alternarTareas(e: EquipoDto): void {
    if (this.equipoAbierto() === e.id) {
      this.equipoAbierto.set(null);

      return;
    }

    this.equipoAbierto.set(e.id);
    this.tareasDeHoy.set([]);
    this.cargarTareasDeHoy(e.id);
  }

  protected pedirArchivar(e: EquipoDto): void {
    this.equipoEnJuego.set(e);
    this.confirmar.set('archivar');
  }

  protected pedirAnular(e: EquipoDto, registro: RegistroTareaEquipoDto): void {
    this.equipoEnJuego.set(e);
    this.registroEnJuego.set(registro);
    this.confirmar.set('anular-tarea');
  }

  protected pedirQuitarMiembro(e: EquipoDto, miembro: { usuarioId: string; nombre: string }): void {
    this.equipoEnJuego.set(e);
    this.miembroEnJuego.set(miembro);
    this.confirmar.set('quitar-miembro');
  }

  protected cerrarConfirmacion(): void {
    this.confirmar.set(null);
    this.equipoEnJuego.set(null);
    this.registroEnJuego.set(null);
    this.miembroEnJuego.set(null);
  }

  protected ejecutarConfirmado(motivo: string): void {
    const accion = this.confirmar();
    const equipo = this.equipoEnJuego();
    const registro = this.registroEnJuego();
    const miembro = this.miembroEnJuego();
    this.cerrarConfirmacion();

    if (!equipo) {
      return;
    }

    if (accion === 'archivar') {
      this.archivarEquipo(equipo);
    } else if (accion === 'anular-tarea' && registro) {
      this.anular(equipo, registro, motivo);
    } else if (accion === 'quitar-miembro' && miembro) {
      this.quitarMiembro(equipo, miembro.usuarioId);
    }
  }

  private anular(e: EquipoDto, registro: RegistroTareaEquipoDto, motivo: string): void {
    this.procesando.set(true);
    this.activity
      .anularTareaEquipo(registro.registroTareaEquipoId, motivo || undefined)
      .subscribe({
        next: () => {
          this.toasts.exito('Tarea anulada: el equipo perdió esos puntos.');
          this.procesando.set(false);
          this.cargarTareasDeHoy(e.id);
          this.cargarPuntajes(this.equipos());
        },
        error: (err) => {
          this.toasts.error(mensajeDeError(err));
          this.procesando.set(false);
        },
      });
  }

  protected deshacer(e: EquipoDto, registro: RegistroTareaEquipoDto): void {
    this.procesando.set(true);
    this.activity.revertirTareaEquipo(registro.registroTareaEquipoId).subscribe({
      next: () => {
        this.toasts.exito('Anulación deshecha: se devolvieron los puntos.');
        this.procesando.set(false);
        this.cargarTareasDeHoy(e.id);
        this.cargarPuntajes(this.equipos());
      },
      error: (err) => {
        this.toasts.error(mensajeDeError(err));
        this.procesando.set(false);
      },
    });
  }

  private cargarTareasDeHoy(equipoId: string): void {
    this.cargandoTareas.set(true);
    this.activity.tareasDeHoyDelEquipo(equipoId).subscribe({
      next: (tareas) => {
        this.tareasDeHoy.set(tareas);
        this.cargandoTareas.set(false);
      },
      error: (err) => {
        this.toasts.error(mensajeDeError(err));
        this.cargandoTareas.set(false);
      },
    });
  }

  protected nombreDe(usuarioId: string): string {
    const enEquipos = this.equipos()
      .flatMap((e) => e.miembros)
      .find((m) => m.usuarioId === usuarioId);

    return enEquipos?.nombre ?? this.usuarios().find((u) => u.id === usuarioId)?.nombre ?? '—';
  }

  protected abrirCrear(): void {
    this.nombre = '';
    this.jefeId = '';
    this.miembrosSel.set(new Set());
    this.creando.set(true);
  }

  protected alternarMiembro(usuarioId: string): void {
    this.miembrosSel.update((set) => {
      const copia = new Set(set);

      if (copia.has(usuarioId)) {
        copia.delete(usuarioId);
      } else {
        copia.add(usuarioId);
      }

      return copia;
    });
  }

  protected crear(evento: Event): void {
    evento.preventDefault();

    if (this.nombre.trim().length === 0 || this.jefeId === '') {
      return;
    }

    this.guardando.set(true);
    this.identity
      .crearEquipo(this.grupoId(), {
        nombre: this.nombre.trim(),
        jefeUsuarioId: this.jefeId,
        miembrosIds: [...this.miembrosSel()].filter((id) => id !== this.jefeId),
      })
      .subscribe({
        next: () => {
          this.toasts.exito('Equipo creado.');
          this.guardando.set(false);
          this.creando.set(false);
          this.cargar(this.grupoId());
        },
        error: (e) => {
          this.toasts.error(mensajeDeError(e));
          this.guardando.set(false);
        },
      });
  }

  /**
   * Hacer jefe a un integrante — fase-14-23 T4·2ª. Antes era un modal aparte
   * con su propio `select` y su propio submit; acá es el botón de la fila de la
   * persona, que es donde la pregunta «¿y si mejor manda este?» se hace.
   *
   * No pide confirmación: el jefe anterior queda de integrante y volver atrás
   * es el mismo clic en la otra fila (regla de la decisión 1).
   */
  protected hacerJefe(e: EquipoDto, usuarioId: string): void {
    this.guardando.set(true);
    this.identity.sustituirJefeEquipo(e.id, { nuevoJefeUsuarioId: usuarioId }).subscribe({
      next: (actualizado) => {
        this.toasts.exito('Jefe actualizado.');
        this.guardando.set(false);
        this.editandoMiembros.set(actualizado);
        this.cargar(this.grupoId(), false);
      },
      error: (err) => {
        this.toasts.error(mensajeDeError(err));
        this.guardando.set(false);
      },
    });
  }

  protected abrirMiembros(e: EquipoDto): void {
    this.agregarId = '';
    this.editandoMiembros.set(e);
  }

  protected agregarMiembro(e: EquipoDto): void {
    if (this.agregarId === '') {
      return;
    }

    this.guardando.set(true);
    this.identity.agregarMiembroEquipo(e.id, { usuarioId: this.agregarId }).subscribe({
      next: (actualizado) => {
        this.toasts.exito('Integrante agregado.');
        this.guardando.set(false);
        this.agregarId = '';
        this.editandoMiembros.set(actualizado);
        this.cargar(this.grupoId(), false);
      },
      error: (err) => {
        this.toasts.error(mensajeDeError(err));
        this.guardando.set(false);
      },
    });
  }

  private quitarMiembro(e: EquipoDto, usuarioId: string): void {
    this.guardando.set(true);
    this.identity.quitarMiembroEquipo(e.id, usuarioId).subscribe({
      next: (actualizado) => {
        this.toasts.exito('Integrante quitado.');
        this.guardando.set(false);
        this.editandoMiembros.set(actualizado);
        this.cargar(this.grupoId(), false);
      },
      error: (err) => {
        this.toasts.error(mensajeDeError(err));
        this.guardando.set(false);
      },
    });
  }

  private archivarEquipo(e: EquipoDto): void {
    this.identity.editarEquipo(e.id, { estado: 'INACTIVO' }).subscribe({
      next: () => {
        this.toasts.exito('Equipo archivado.');
        this.cargar(this.grupoId());
      },
      error: (err) => this.toasts.error(mensajeDeError(err)),
    });
  }

  private cargar(grupoId: string, mostrarSpinner = true): void {
    if (mostrarSpinner) {
      this.cargando.set(true);
    }

    forkJoin({
      equipos: this.identity.listarEquipos(grupoId),
      usuarios: this.identity.listarUsuarios(grupoId),
    }).subscribe({
      next: ({ equipos, usuarios }) => {
        const activos = equipos.filter((e) => e.estado === 'ACTIVO');
        this.equipos.set(activos);
        this.usuarios.set(usuarios);

        const enEquipo = new Set(activos.flatMap((e) => e.miembros.map((m) => m.usuarioId)));
        this.disponibles.set(
          usuarios.filter((u) => u.estado === 'ACTIVO' && !enEquipo.has(u.id))
        );

        this.cargando.set(false);
        this.cargarPuntajes(activos);
      },
      error: () => this.cargando.set(false),
    });
  }

  private cargarPuntajes(equipos: EquipoDto[]): void {
    for (const e of equipos) {
      this.scoring.puntajeDeEquipo(e.id).subscribe({
        next: (p) => this.puntajes.update((prev) => ({ ...prev, [e.id]: p.puntajeTotal })),
        error: () => undefined,
      });
    }
  }
}
