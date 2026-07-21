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
        <p class="mt-8 text-center text-sm text-slate-400">Cargando…</p>
      } @else if (actividades().length === 0) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Todavía no hay actividades. Creá la primera.
        </div>
      } @else {
        <ul class="mt-5 grid gap-3 sm:grid-cols-2">
          @for (a of actividades(); track a.id) {
            <li class="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate font-semibold text-slate-900">{{ a.nombre }}</p>
                  @if (a.descripcion) {
                    <p class="mt-0.5 line-clamp-2 text-xs text-slate-500">{{ a.descripcion }}</p>
                  }
                </div>
                <span class="shrink-0 rounded-full bg-marca-50 px-2.5 py-1 text-sm font-bold text-marca-700">
                  +{{ a.valorPuntos }}
                </span>
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span class="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                  {{ etiquetaLimite(a) }}
                </span>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                  {{ a.tipoPuntaje === 'OBLIGATORIA' ? 'Obligatoria' : 'Opcional' }}
                </span>
              </div>

              <div class="mt-3 flex justify-end gap-1 border-t border-slate-50 pt-2">
                <button
                  type="button"
                  (click)="abrirEditar(a)"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-marca-600"
                  aria-label="Editar"
                >
                  <span class="h-4 w-4"><app-icono nombre="pencil" /></span>
                </button>
                <button
                  type="button"
                  (click)="pedirArchivar(a)"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
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
          class="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up sm:rounded-2xl"
        >
          <h2 class="text-lg font-bold text-slate-900">
            {{ editando() ? 'Editar actividad' : 'Nueva actividad' }}
          </h2>

          <div class="mt-4 space-y-3">
            <label class="block">
              <span class="text-xs font-semibold text-slate-600">Nombre</span>
              <input
                [(ngModel)]="form.nombre"
                name="nombre"
                required
                maxlength="120"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
              />
            </label>

            <label class="block">
              <span class="text-xs font-semibold text-slate-600">Descripción (opcional)</span>
              <textarea
                [(ngModel)]="form.descripcion"
                name="descripcion"
                rows="2"
                maxlength="1000"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
              ></textarea>
            </label>

            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="text-xs font-semibold text-slate-600">Puntos</span>
                <input
                  [(ngModel)]="form.valorPuntos"
                  name="valorPuntos"
                  type="number"
                  min="1"
                  required
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
                />
              </label>
              <label class="block">
                <span class="text-xs font-semibold text-slate-600">Tipo</span>
                <select
                  [(ngModel)]="form.tipoPuntaje"
                  name="tipoPuntaje"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
                >
                  <option [ngValue]="TP.OPCIONAL">Opcional</option>
                  <option [ngValue]="TP.OBLIGATORIA">Obligatoria</option>
                </select>
              </label>
            </div>

            @if (form.tipoPuntaje === TP.OBLIGATORIA) {
              <label
                class="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 animate-fade-in"
              >
                <input
                  [(ngModel)]="form.requiereConfirmacion"
                  name="requiereConfirmacion"
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-marca-600 focus:ring-marca-200"
                />
                <span class="text-xs text-slate-600">
                  <span class="font-semibold text-slate-700">¿Requiere que el usuario confirme?</span>
                  <span class="mt-0.5 block text-slate-500">
                    Si se activa, el usuario debe marcar «Ya lo hice» durante la sesión. Si no lo
                    confirma, al cerrar la sesión se le descuentan los puntos automáticamente.
                  </span>
                </span>
              </label>
            }

            <label class="block">
              <span class="text-xs font-semibold text-slate-600">Límite de tiempo</span>
              <select
                [(ngModel)]="form.tipoLimiteTiempo"
                name="tipoLimiteTiempo"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
              >
                <option [ngValue]="TLT.SIN_LIMITE">Sin límite</option>
                <option [ngValue]="TLT.DEADLINE">Hora límite (deadline)</option>
                <option [ngValue]="TLT.CRONOMETRO">Cronómetro</option>
              </select>
            </label>

            @if (form.tipoLimiteTiempo === TLT.DEADLINE) {
              <label class="block animate-fade-in">
                <span class="text-xs font-semibold text-slate-600">Hora límite (HH:mm)</span>
                <input
                  [(ngModel)]="form.deadlineHora"
                  name="deadlineHora"
                  type="time"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
                />
              </label>
            }

            @if (form.tipoLimiteTiempo === TLT.CRONOMETRO) {
              <label class="block animate-fade-in">
                <span class="text-xs font-semibold text-slate-600">Duración (minutos)</span>
                <input
                  [(ngModel)]="form.duracionCronometroMinutos"
                  name="duracionCronometroMinutos"
                  type="number"
                  min="1"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
                />
              </label>
            }

            <label class="block">
              <span class="text-xs font-semibold text-slate-600">Repeticiones máx. por sesión</span>
              <input
                [(ngModel)]="form.repeticionesMaximasSesion"
                name="repeticionesMaximasSesion"
                type="number"
                min="1"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
              />
            </label>
          </div>

          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              (click)="cerrarForm()"
              class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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

    return {
      nombre: f.nombre.trim(),
      descripcion: f.descripcion.trim() || null,
      tipoPuntaje: f.tipoPuntaje,
      valorPuntos: Number(f.valorPuntos),
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
