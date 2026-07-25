import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  type ActividadDto,
  AlcanceActividad,
  ComportamientoAlCierre,
  TipoLimiteTiempo,
  TipoPuntaje,
} from '@dorado/shared-types';
import { ConfirmDialogComponent } from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import type { CrearActividadRequest } from '../../core/api/api.types';
import { mensajeDeError } from '../../core/api/errores';

interface FormActividad {
  nombre: string;
  descripcion: string;
  tipoPuntaje: TipoPuntaje;
  valorPuntos: number;
  tipoLimiteTiempo: TipoLimiteTiempo;
  deadlineHora: string;
  duracionCronometroMinutos: number;
  repeticionesMaximasSesion: number;
  /** Solo aplica a OBLIGATORIA (fase-14-08); se mapea a comportamientoAlCierre. */
  requiereConfirmacion: boolean;
  /** fase-14-09: EQUIPO = la completa el jefe y se reparte a los integrantes. */
  alcance: AlcanceActividad;
  bonoJefePuntos: number;
}

const FORM_VACIO: FormActividad = {
  nombre: '',
  descripcion: '',
  tipoPuntaje: TipoPuntaje.OPCIONAL,
  valorPuntos: 10,
  tipoLimiteTiempo: TipoLimiteTiempo.SIN_LIMITE,
  deadlineHora: '20:00',
  duracionCronometroMinutos: 15,
  repeticionesMaximasSesion: 1,
  requiereConfirmacion: false,
  alcance: AlcanceActividad.INDIVIDUAL,
  bonoJefePuntos: 0,
};

/** CRUD de Actividades (fase-10). Form con campos condicionales por tipoLimiteTiempo. */
@Component({
  selector: 'app-actividades',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    EncabezadoPaginaComponent,
    IconoComponent,
    ConfirmDialogComponent,
  ],
  template: `
    <section class="mx-auto max-w-4xl px-4 py-6">
      <app-encabezado-pagina titulo="Actividades" subtitulo="Lo que suma puntos cada sesión.">
        <button
          type="button"
          (click)="abrirNueva()"
          class="flex items-center gap-1.5 rounded-lg bg-marca-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-marca-700"
        >
          <span class="h-4 w-4"><app-icono nombre="plus" /></span>
          Nueva
        </button>
      </app-encabezado-pagina>

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (actividades().length === 0) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Todavía no hay actividades. Creá la primera.
        </div>
      } @else {
        <ul class="mt-5 grid gap-3 sm:grid-cols-2">
          @for (a of actividades(); track a.id) {
            <li class="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate font-semibold text-slate-900 dark:text-white">{{ a.nombre }}</p>
                  @if (a.descripcion) {
                    <p class="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{{ a.descripcion }}</p>
                  }
                </div>
                @if (a.tipoPuntaje === 'OBLIGATORIA') {
                  <span
                    class="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-sm font-bold text-red-600 dark:bg-red-500/15 dark:text-red-400"
                    title="Resta puntos si no se hace"
                  >
                    −{{ a.valorPuntos }}
                  </span>
                } @else {
                  <span class="shrink-0 rounded-full bg-marca-50 px-2.5 py-1 text-sm font-bold text-marca-700 dark:bg-marca-900/40 dark:text-marca-300">
                    +{{ a.valorPuntos }}
                  </span>
                }
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span class="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {{ etiquetaLimite(a) }}
                </span>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {{ a.tipoPuntaje === 'OBLIGATORIA' ? 'Obligatoria' : 'Opcional' }}
                </span>
                @if (a.alcance === 'EQUIPO') {
                  <span class="rounded-full bg-teal-100 px-2 py-0.5 font-semibold text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                    👥 Equipo@if (a.bonoJefePuntos > 0) { · jefe +{{ a.bonoJefePuntos }} }
                  </span>
                }
              </div>

              <div class="mt-3 flex justify-end gap-1 border-t border-slate-50 pt-2 dark:border-slate-800">
                <button
                  type="button"
                  (click)="abrirEditar(a)"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-marca-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-marca-300"
                  aria-label="Editar"
                >
                  <span class="h-4 w-4"><app-icono nombre="pencil" /></span>
                </button>
                <button
                  type="button"
                  (click)="pedirArchivar(a)"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  aria-label="Archivar"
                >
                  <span class="h-4 w-4"><app-icono nombre="trash" /></span>
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </section>

    <!-- ===== Modal form ===== -->
    @if (formAbierto()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <button
          type="button"
          aria-label="Cerrar"
          (click)="cerrarForm()"
          class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"
        ></button>
        <form
          (submit)="guardar($event)"
          class="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up dark:bg-slate-900 sm:rounded-2xl"
        >
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">
            {{ editando() ? 'Editar actividad' : 'Nueva actividad' }}
          </h2>

          <div class="mt-4 space-y-3">
            <label class="block">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Nombre</span>
              <input
                [(ngModel)]="form.nombre"
                name="nombre"
                required
                maxlength="120"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              />
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Descripción (opcional)</span>
              <textarea
                [(ngModel)]="form.descripcion"
                name="descripcion"
                rows="2"
                maxlength="1000"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              ></textarea>
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Alcance</span>
              <select
                [(ngModel)]="form.alcance"
                name="alcance"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              >
                <option [ngValue]="AA.INDIVIDUAL">Individual</option>
                <option [ngValue]="AA.EQUIPO">Equipo</option>
              </select>
            </label>

            @if (form.alcance === AA.EQUIPO) {
              <div class="rounded-lg bg-teal-50 p-3 text-xs text-teal-800 animate-fade-in dark:bg-teal-500/10 dark:text-teal-200">
                👥 La completa el <strong>jefe</strong> del equipo una vez y los puntos se reparten a cada integrante. Las tareas de equipo son opcionales (suman).
              </div>
              <div class="grid grid-cols-2 gap-3 animate-fade-in">
                <label class="block">
                  <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Puntos por integrante</span>
                  <input
                    [(ngModel)]="form.valorPuntos"
                    name="valorPuntos"
                    type="number"
                    min="1"
                    required
                    class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                  />
                </label>
                <label class="block">
                  <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Bono al jefe</span>
                  <input
                    [(ngModel)]="form.bonoJefePuntos"
                    name="bonoJefePuntos"
                    type="number"
                    min="0"
                    class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                  />
                </label>
              </div>
            } @else {
              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Puntos</span>
                  <input
                    [(ngModel)]="form.valorPuntos"
                    name="valorPuntos"
                    type="number"
                    min="1"
                    required
                    class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                  />
                </label>
                <label class="block">
                  <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Tipo</span>
                  <select
                    [(ngModel)]="form.tipoPuntaje"
                    name="tipoPuntaje"
                    class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                  >
                    <option [ngValue]="TP.OPCIONAL">Opcional</option>
                    <option [ngValue]="TP.OBLIGATORIA">Obligatoria</option>
                  </select>
                </label>
              </div>
            }

            @if (form.alcance === AA.INDIVIDUAL && form.tipoPuntaje === TP.OBLIGATORIA) {
              <label
                class="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 animate-fade-in dark:border-slate-700 dark:bg-slate-800/50"
              >
                <input
                  [(ngModel)]="form.requiereConfirmacion"
                  name="requiereConfirmacion"
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-marca-600 focus:ring-marca-200 dark:border-slate-600"
                />
                <span class="text-xs text-slate-600 dark:text-slate-300">
                  <span class="font-semibold text-slate-700 dark:text-slate-100">¿Requiere que el usuario confirme?</span>
                  <span class="mt-0.5 block text-slate-500 dark:text-slate-400">
                    Si se activa, el usuario debe marcar «Ya lo hice» durante la sesión. Si no lo
                    confirma, al cerrar la sesión se le descuentan los puntos automáticamente.
                  </span>
                </span>
              </label>
            }

            <label class="block">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Límite de tiempo</span>
              <select
                [(ngModel)]="form.tipoLimiteTiempo"
                name="tipoLimiteTiempo"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              >
                <option [ngValue]="TLT.SIN_LIMITE">Sin límite</option>
                <option [ngValue]="TLT.DEADLINE">Hora límite (deadline)</option>
                <option [ngValue]="TLT.CRONOMETRO">Cronómetro</option>
              </select>
            </label>

            @if (form.tipoLimiteTiempo === TLT.DEADLINE) {
              <label class="block animate-fade-in">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Hora límite (HH:mm)</span>
                <input
                  [(ngModel)]="form.deadlineHora"
                  name="deadlineHora"
                  type="time"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                />
              </label>
            }

            @if (form.tipoLimiteTiempo === TLT.CRONOMETRO) {
              <label class="block animate-fade-in">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Duración (minutos)</span>
                <input
                  [(ngModel)]="form.duracionCronometroMinutos"
                  name="duracionCronometroMinutos"
                  type="number"
                  min="1"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                />
              </label>
            }

            <label class="block">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Repeticiones máx. por sesión</span>
              <input
                [(ngModel)]="form.repeticionesMaximasSesion"
                name="repeticionesMaximasSesion"
                type="number"
                min="1"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              />
            </label>
          </div>

          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              (click)="cerrarForm()"
              class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="guardando()"
              class="rounded-lg bg-marca-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
            >
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    }

    <ui-confirm-dialog
      [abierto]="aArchivar() !== null"
      titulo="Archivar actividad"
      [mensaje]="'¿Archivar «' + (aArchivar()?.nombre ?? '') + '»? No se podrá reactivar; si la necesitás de nuevo, creá una nueva.'"
      textoConfirmar="Archivar"
      (confirmar)="confirmarArchivar()"
      (cancelar)="aArchivar.set(null)"
    />
  `,
})
export class ActividadesPage {
  readonly grupoId = input.required<string>();

  protected readonly TP = TipoPuntaje;

  protected readonly TLT = TipoLimiteTiempo;

  protected readonly AA = AlcanceActividad;

  private readonly api = inject(ActivityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly actividades = signal<ActividadDto[]>([]);

  protected readonly formAbierto = signal(false);

  protected readonly guardando = signal(false);

  protected readonly editando = signal<ActividadDto | null>(null);

  protected readonly aArchivar = signal<ActividadDto | null>(null);

  protected form: FormActividad = { ...FORM_VACIO };

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  protected etiquetaLimite(a: ActividadDto): string {
    switch (a.tipoLimiteTiempo) {
      case TipoLimiteTiempo.DEADLINE:
        return `Hasta ${a.deadlineHora}`;
      case TipoLimiteTiempo.CRONOMETRO:
        return `${a.duracionCronometroMinutos} min`;
      default:
        return 'Sin límite';
    }
  }

  protected abrirNueva(): void {
    this.editando.set(null);
    this.form = { ...FORM_VACIO };
    this.formAbierto.set(true);
  }

  protected abrirEditar(a: ActividadDto): void {
    this.editando.set(a);
    this.form = {
      nombre: a.nombre,
      descripcion: a.descripcion ?? '',
      tipoPuntaje: a.tipoPuntaje,
      valorPuntos: a.valorPuntos,
      tipoLimiteTiempo: a.tipoLimiteTiempo,
      deadlineHora: a.deadlineHora ?? '20:00',
      duracionCronometroMinutos: a.duracionCronometroMinutos ?? 15,
      repeticionesMaximasSesion: a.repeticionesMaximasSesion,
      requiereConfirmacion:
        a.comportamientoAlCierre === ComportamientoAlCierre.REQUIERE_CONFIRMACION,
      alcance: a.alcance,
      bonoJefePuntos: a.bonoJefePuntos,
    };
    this.formAbierto.set(true);
  }

  protected cerrarForm(): void {
    this.formAbierto.set(false);
  }

  protected guardar(evento: Event): void {
    evento.preventDefault();

    if (this.form.nombre.trim().length === 0) {
      return;
    }

    this.guardando.set(true);
    const datos = this.armarPayload();
    const actual = this.editando();

    const peticion = actual
      ? this.api.editarActividad(actual.id, datos)
      : this.api.crearActividad(this.grupoId(), datos);

    peticion.subscribe({
      next: () => {
        this.toasts.exito(actual ? 'Actividad actualizada.' : 'Actividad creada.');
        this.guardando.set(false);
        this.formAbierto.set(false);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.guardando.set(false);
      },
    });
  }

  protected pedirArchivar(a: ActividadDto): void {
    this.aArchivar.set(a);
  }

  protected confirmarArchivar(): void {
    const a = this.aArchivar();

    if (!a) {
      return;
    }

    this.api.archivarActividad(a.id).subscribe({
      next: () => {
        this.toasts.exito('Actividad archivada.');
        this.aArchivar.set(null);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.aArchivar.set(null);
      },
    });
  }

  private armarPayload(): CrearActividadRequest {
    const f = this.form;
    const esEquipo = f.alcance === AlcanceActividad.EQUIPO;

    return {
      nombre: f.nombre.trim(),
      descripcion: f.descripcion.trim() || null,
      // Una tarea de equipo es siempre OPCIONAL (el backend lo exige, fase-14-09).
      tipoPuntaje: esEquipo ? TipoPuntaje.OPCIONAL : f.tipoPuntaje,
      valorPuntos: Number(f.valorPuntos),
      alcance: f.alcance,
      bonoJefePuntos: esEquipo ? Number(f.bonoJefePuntos) : 0,
      tipoLimiteTiempo: f.tipoLimiteTiempo,
      deadlineHora: f.tipoLimiteTiempo === TipoLimiteTiempo.DEADLINE ? f.deadlineHora : null,
      duracionCronometroMinutos:
        f.tipoLimiteTiempo === TipoLimiteTiempo.CRONOMETRO
          ? Number(f.duracionCronometroMinutos)
          : null,
      repeticionesMaximasSesion: Number(f.repeticionesMaximasSesion),
      // Solo una OBLIGATORIA puede requerir confirmación; para OPCIONAL el
      // backend fuerza ASUME_HECHA igual (fase-14-08).
      comportamientoAlCierre:
        f.tipoPuntaje === TipoPuntaje.OBLIGATORIA && f.requiereConfirmacion
          ? ComportamientoAlCierre.REQUIERE_CONFIRMACION
          : ComportamientoAlCierre.ASUME_HECHA,
    };
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);
    this.api.listarActividades(grupoId, 'ACTIVA').subscribe({
      next: (a) => {
        this.actividades.set(a);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
