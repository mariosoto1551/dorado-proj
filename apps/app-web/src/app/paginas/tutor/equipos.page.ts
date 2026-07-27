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
  RolEquipoMiembro,
  type EquipoDto,
  type RegistroTareaEquipoDto,
  type TareaEquipoDeHoyDto,
  type UsuarioDto,
} from '@dorado/shared-types';
import { ConfirmDialogComponent } from '@dorado/shared-ui';

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
  imports: [FormsModule, EncabezadoPaginaComponent, ConfirmDialogComponent],
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
          class="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-marca-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
        >
          ＋ Nuevo equipo
        </button>
        @if (disponibles().length === 0 && equipos().length > 0) {
          <p class="mt-2 text-center text-xs text-slate-400 dark:text-slate-500">
            Todos los participantes ya están en un equipo.
          </p>
        }

        @if (equipos().length === 0) {
          <div class="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Todavía no hay equipos en este grupo.
          </div>
        } @else {
          <ul class="mt-4 space-y-3">
            @for (e of equipos(); track e.id) {
              <li class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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

                <div class="mt-3 flex flex-wrap gap-2">
                  <button type="button" (click)="abrirJefe(e)" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Sustituir jefe</button>
                  <button type="button" (click)="abrirMiembros(e)" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Integrantes</button>
                  <button type="button" (click)="alternarTareas(e)" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    {{ equipoAbierto() === e.id ? 'Ocultar tareas' : 'Tareas de hoy' }}
                  </button>
                  <button type="button" (click)="aArchivar.set(e)" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-500/10">Archivar</button>
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
                      <input
                        type="text"
                        [(ngModel)]="motivoAnular"
                        maxlength="200"
                        placeholder="Motivo (opcional) — lo ve el equipo"
                        class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                      />

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
                                  (click)="anular(e, fila.registro)"
                                  [disabled]="procesando()"
                                  class="flex-none rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-500/10"
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
    @if (creando()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <button type="button" aria-label="Cerrar" (click)="creando.set(false)" class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"></button>
        <form (submit)="crear($event)" class="relative max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up dark:bg-slate-900 sm:rounded-2xl">
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">Nuevo equipo</h2>
          <label class="mt-4 block">
            <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Nombre</span>
            <input [(ngModel)]="nombre" name="nombre" required maxlength="120" placeholder="Equipo Fénix" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white" />
          </label>
          <label class="mt-4 block">
            <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Jefe del equipo</span>
            <select [(ngModel)]="jefeId" name="jefe" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40 dark:text-white">
              <option value="" disabled>Elegí un participante…</option>
              @for (u of disponibles(); track u.id) {
                <option [value]="u.id">{{ u.nombre }}</option>
              }
            </select>
          </label>
          <fieldset class="mt-4">
            <legend class="text-xs font-semibold text-slate-600 dark:text-slate-300">Integrantes</legend>
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
          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" (click)="creando.set(false)" class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancelar</button>
            <button type="submit" [disabled]="guardando() || jefeId === ''" class="rounded-lg bg-marca-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50">Crear equipo</button>
          </div>
        </form>
      </div>
    }

    <!-- Modal sustituir jefe -->
    @if (editandoJefe(); as e) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <button type="button" aria-label="Cerrar" (click)="editandoJefe.set(null)" class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"></button>
        <form (submit)="guardarJefe($event)" class="relative w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up dark:bg-slate-900 sm:rounded-2xl">
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">Sustituir jefe</h2>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ e.nombre }} · el jefe anterior pasa a integrante.</p>
          <select [(ngModel)]="nuevoJefeId" name="nuevoJefe" class="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40 dark:text-white">
            @for (m of e.miembros; track m.usuarioId) {
              <option [value]="m.usuarioId" [disabled]="m.rol === 'JEFE'">{{ m.nombre }}{{ m.rol === 'JEFE' ? ' (jefe actual)' : '' }}</option>
            }
          </select>
          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" (click)="editandoJefe.set(null)" class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancelar</button>
            <button type="submit" [disabled]="guardando()" class="rounded-lg bg-marca-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50">Guardar</button>
          </div>
        </form>
      </div>
    }

    <!-- Modal integrantes -->
    @if (editandoMiembros(); as e) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <button type="button" aria-label="Cerrar" (click)="editandoMiembros.set(null)" class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"></button>
        <div class="relative max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up dark:bg-slate-900 sm:rounded-2xl">
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">Integrantes · {{ e.nombre }}</h2>
          <ul class="mt-3 space-y-1.5">
            @for (m of e.miembros; track m.usuarioId) {
              <li class="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <span class="flex-1 text-slate-800 dark:text-slate-100">{{ m.nombre }}</span>
                @if (m.rol === 'JEFE') {
                  <span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">★ Jefe</span>
                } @else {
                  <button type="button" (click)="quitarMiembro(e, m.usuarioId)" [disabled]="guardando()" class="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-500/10">Quitar</button>
                }
              </li>
            }
          </ul>
          @if (disponibles().length > 0) {
            <div class="mt-4 flex gap-2">
              <select [(ngModel)]="agregarId" name="agregar" class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40 dark:text-white">
                <option value="">Agregar integrante…</option>
                @for (u of disponibles(); track u.id) {
                  <option [value]="u.id">{{ u.nombre }}</option>
                }
              </select>
              <button type="button" (click)="agregarMiembro(e)" [disabled]="guardando() || agregarId === ''" class="rounded-lg bg-marca-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50">Agregar</button>
            </div>
          }
          <button type="button" (click)="editandoMiembros.set(null)" class="mt-4 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Listo</button>
        </div>
      </div>
    }

    <ui-confirm-dialog
      [abierto]="aArchivar() !== null"
      titulo="Archivar equipo"
      [mensaje]="'¿Archivar «' + (aArchivar()?.nombre ?? '') + '»? Dejará de aparecer para sus integrantes.'"
      textoConfirmar="Archivar"
      (confirmar)="confirmarArchivar()"
      (cancelar)="aArchivar.set(null)"
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

  protected readonly editandoJefe = signal<EquipoDto | null>(null);

  protected readonly editandoMiembros = signal<EquipoDto | null>(null);

  protected readonly aArchivar = signal<EquipoDto | null>(null);

  // Formularios (ngModel)
  protected nombre = '';

  protected jefeId = '';

  protected readonly miembrosSel = signal<Set<string>>(new Set());

  protected nuevoJefeId = '';

  protected agregarId = '';

  /** Participantes activos del grupo que no están en ningún equipo. */
  protected readonly disponibles = signal<UsuarioDto[]>([]);

  // --- Anular tareas de equipo (fase-14-13) ---

  /** Equipo cuyo bloque "Tareas de hoy" está desplegado; null = ninguno. */
  protected readonly equipoAbierto = signal<string | null>(null);

  protected readonly cargandoTareas = signal(false);

  protected readonly procesando = signal(false);

  protected motivoAnular = '';

  private readonly tareasDeHoy = signal<TareaEquipoDeHoyDto[]>([]);

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
    this.motivoAnular = '';
    this.tareasDeHoy.set([]);
    this.cargarTareasDeHoy(e.id);
  }

  protected anular(e: EquipoDto, registro: RegistroTareaEquipoDto): void {
    this.procesando.set(true);
    this.activity
      .anularTareaEquipo(registro.registroTareaEquipoId, this.motivoAnular || undefined)
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

  protected abrirJefe(e: EquipoDto): void {
    this.nuevoJefeId = e.miembros.find((m) => m.rol !== RolEquipoMiembro.JEFE)?.usuarioId ?? '';
    this.editandoJefe.set(e);
  }

  protected guardarJefe(evento: Event): void {
    evento.preventDefault();
    const e = this.editandoJefe();

    if (!e || this.nuevoJefeId === '') {
      return;
    }

    this.guardando.set(true);
    this.identity.sustituirJefeEquipo(e.id, { nuevoJefeUsuarioId: this.nuevoJefeId }).subscribe({
      next: () => {
        this.toasts.exito('Jefe actualizado.');
        this.guardando.set(false);
        this.editandoJefe.set(null);
        this.cargar(this.grupoId());
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

  protected quitarMiembro(e: EquipoDto, usuarioId: string): void {
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

  protected confirmarArchivar(): void {
    const e = this.aArchivar();

    if (!e) {
      return;
    }

    this.identity.editarEquipo(e.id, { estado: 'INACTIVO' }).subscribe({
      next: () => {
        this.toasts.exito('Equipo archivado.');
        this.aArchivar.set(null);
        this.cargar(this.grupoId());
      },
      error: (err) => {
        this.toasts.error(mensajeDeError(err));
        this.aArchivar.set(null);
      },
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
