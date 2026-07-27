import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  type ActividadDto,
  EstadoPropuesta,
  ModoCreacionContenidoUsuario,
  type MisActividadesDto,
  type PropuestaActividadDto,
} from '@dorado/shared-types';
import { ConfirmDialogComponent } from '@dorado/shared-ui';

import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import { mensajeDeError } from '../../core/api/errores';
import { AuthService } from '../../core/auth/auth.service';

interface FormMiActividad {
  nombre: string;
  descripcion: string;
  valorPuntos: number;
  repeticionesMaximasSesion: number;
}

const FORM_VACIO: FormMiActividad = {
  nombre: '',
  descripcion: '',
  valorPuntos: 1,
  repeticionesMaximasSesion: 1,
};

/**
 * "Mis actividades" del integrante (fase-14-10). Lo que ve depende del modo que
 * el Tutor configuró para el Grupo: en RESTRICTIVO no puede crear; en
 * BAJO_APROBACION lo que crea espera al Tutor; en LIBRE queda activo al instante.
 */
@Component({
  selector: 'app-mis-actividades',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, IconoComponent, ConfirmDialogComponent],
  template: `
    <section class="mx-auto max-w-xl px-4 py-5">
      <div class="flex items-center gap-3">
        <a
          routerLink="/"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Volver"
        >
          <span class="h-5 w-5 rotate-180"><app-icono nombre="chevron" /></span>
        </a>
        <div class="min-w-0">
          <h1 class="text-xl font-extrabold text-slate-900 dark:text-white">Mis metas</h1>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Actividades que armás vos, solo para vos.
          </p>
        </div>
      </div>

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (datos(); as d) {
        <!-- Estado del modo del grupo -->
        <div class="mt-5 rounded-2xl p-4 text-sm" [class]="claseAviso()">
          {{ textoAviso() }}
        </div>

        @if (d.modoCreacionUsuario !== MC.RESTRICTIVO) {
          <div class="mt-4 flex items-center justify-between">
            <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Usás {{ d.cupoUsado }} de {{ d.maxActividadesActivasPorUsuario }}
              · hasta {{ d.maxPuntosActividadUsuario }} pts cada una
            </p>
            @if (!formAbierto()) {
              <button
                type="button"
                (click)="abrirForm()"
                [disabled]="!d.puedeCrear"
                class="flex items-center gap-1.5 rounded-lg bg-marca-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-40"
              >
                <span class="h-4 w-4"><app-icono nombre="plus" /></span>
                Crear la mía
              </button>
            }
          </div>

          @if (formAbierto()) {
            <form
              (submit)="crear($event)"
              class="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm animate-fade-in dark:border-slate-800 dark:bg-slate-900"
            >
              <label class="block">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">¿Qué querés hacer?</span>
                <input
                  [(ngModel)]="form.nombre"
                  name="nombre"
                  required
                  maxlength="120"
                  placeholder="Practicar guitarra"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                />
              </label>

              <label class="mt-3 block">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Detalle (opcional)</span>
                <textarea
                  [(ngModel)]="form.descripcion"
                  name="descripcion"
                  rows="2"
                  maxlength="1000"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                ></textarea>
              </label>

              <div class="mt-3 grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Puntos (máx. {{ d.maxPuntosActividadUsuario }})
                  </span>
                  <input
                    [(ngModel)]="form.valorPuntos"
                    name="valorPuntos"
                    type="number"
                    min="1"
                    [max]="d.maxPuntosActividadUsuario"
                    required
                    class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                  />
                </label>
                <label class="block">
                  <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Veces por día</span>
                  <input
                    [(ngModel)]="form.repeticionesMaximasSesion"
                    name="repeticionesMaximasSesion"
                    type="number"
                    min="1"
                    max="20"
                    class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                  />
                </label>
              </div>

              <div class="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  (click)="formAbierto.set(false)"
                  class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  [disabled]="guardando()"
                  class="rounded-lg bg-marca-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
                >
                  {{ guardando() ? 'Guardando…' : etiquetaGuardar() }}
                </button>
              </div>
            </form>
          }
        }

        <!-- Activas -->
        @if (d.actividades.length > 0) {
          <h2 class="mt-6 mb-2 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Activas
          </h2>
          <ul class="space-y-2">
            @for (a of d.actividades; track a.id) {
              <li class="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold text-slate-900 dark:text-white">{{ a.nombre }}</p>
                  <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <span class="font-bold text-marca-600 dark:text-marca-400">+{{ a.valorPuntos }} pts</span>
                    @if (a.repeticionesMaximasSesion > 1) {
                      · hasta {{ a.repeticionesMaximasSesion }}× por día
                    }
                  </p>
                </div>
                <button
                  type="button"
                  (click)="aArchivar.set(a)"
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  aria-label="Archivar"
                >
                  <span class="h-4 w-4"><app-icono nombre="trash" /></span>
                </button>
              </li>
            }
          </ul>
        }

        <!-- Propuestas (pendientes y resueltas) -->
        @if (propuestasVisibles().length > 0) {
          <h2 class="mt-6 mb-2 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Esperando o resueltas
          </h2>
          <ul class="space-y-2">
            @for (p of propuestasVisibles(); track p.id) {
              <li class="rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div class="flex items-start justify-between gap-2">
                  <p class="min-w-0 truncate font-semibold text-slate-800 dark:text-slate-100">
                    {{ p.nombre }}
                  </p>
                  <span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold" [class]="claseEstado(p)">
                    {{ etiquetaEstado(p) }}
                  </span>
                </div>
                @if (p.estado === EP.RECHAZADA && p.motivoRechazo) {
                  <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">“{{ p.motivoRechazo }}”</p>
                }
              </li>
            }
          </ul>
        }

        @if (d.actividades.length === 0 && propuestasVisibles().length === 0 && d.modoCreacionUsuario !== MC.RESTRICTIVO) {
          <p class="mt-6 text-center text-sm text-slate-400 dark:text-slate-500">
            Todavía no creaste ninguna. 🌱
          </p>
        }
      }
    </section>

    <ui-confirm-dialog
      [abierto]="aArchivar() !== null"
      titulo="Archivar mi actividad"
      [mensaje]="'¿Archivar «' + (aArchivar()?.nombre ?? '') + '»? Deja de aparecer en tu día y te libera un lugar.'"
      textoConfirmar="Archivar"
      (confirmar)="confirmarArchivar()"
      (cancelar)="aArchivar.set(null)"
    />
  `,
})
export class MisActividadesPage {
  protected readonly MC = ModoCreacionContenidoUsuario;

  protected readonly EP = EstadoPropuesta;

  private readonly auth = inject(AuthService);

  private readonly api = inject(ActivityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly guardando = signal(false);

  protected readonly formAbierto = signal(false);

  protected readonly datos = signal<MisActividadesDto | null>(null);

  protected readonly aArchivar = signal<ActividadDto | null>(null);

  protected form: FormMiActividad = { ...FORM_VACIO };

  /**
   * Las propuestas que aportan información: las que esperan al Tutor y las
   * rechazadas. Las aprobadas ya están en la lista de activas — mostrarlas dos
   * veces solo confunde.
   */
  protected readonly propuestasVisibles = computed(() =>
    (this.datos()?.propuestas ?? []).filter(
      (p) => p.estado === EstadoPropuesta.PENDIENTE || p.estado === EstadoPropuesta.RECHAZADA
    )
  );

  constructor() {
    // Reacciona al grupo activo (participante multi-grupo, fase-14).
    effect(() => {
      this.auth.grupoUsuario();
      this.cargar();
    });
  }

  protected textoAviso(): string {
    switch (this.datos()?.modoCreacionUsuario) {
      case ModoCreacionContenidoUsuario.LIBRE:
        return 'Podés crear tus propias metas y quedan activas al instante. Solo las ves vos (y tu tutor).';
      case ModoCreacionContenidoUsuario.BAJO_APROBACION:
        return 'Podés proponer tus propias metas: tu tutor las revisa y, si las aprueba, empiezan a sumar puntos.';
      default:
        return 'Tu tutor todavía no habilitó que los integrantes creen sus propias actividades.';
    }
  }

  protected claseAviso(): string {
    switch (this.datos()?.modoCreacionUsuario) {
      case ModoCreacionContenidoUsuario.LIBRE:
        return 'bg-marca-50 text-marca-800 dark:bg-marca-900/20 dark:text-marca-200';
      case ModoCreacionContenidoUsuario.BAJO_APROBACION:
        return 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200';
      default:
        return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
    }
  }

  protected etiquetaGuardar(): string {
    return this.datos()?.modoCreacionUsuario === ModoCreacionContenidoUsuario.LIBRE
      ? 'Crear'
      : 'Enviar al tutor';
  }

  protected etiquetaEstado(p: PropuestaActividadDto): string {
    switch (p.estado) {
      case EstadoPropuesta.PENDIENTE:
        return '⏳ Esperando al tutor';
      case EstadoPropuesta.RECHAZADA:
        return 'Rechazada';
      default:
        return 'Aprobada';
    }
  }

  protected claseEstado(p: PropuestaActividadDto): string {
    switch (p.estado) {
      case EstadoPropuesta.PENDIENTE:
        return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
      case EstadoPropuesta.RECHAZADA:
        return 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300';
      default:
        return 'bg-marca-50 text-marca-700 dark:bg-marca-900/40 dark:text-marca-300';
    }
  }

  protected abrirForm(): void {
    this.form = { ...FORM_VACIO };
    this.formAbierto.set(true);
  }

  protected crear(evento: Event): void {
    evento.preventDefault();

    const grupoId = this.auth.grupoUsuario();

    if (!grupoId || this.form.nombre.trim().length === 0) {
      return;
    }

    this.guardando.set(true);

    this.api
      .crearMiActividad(grupoId, {
        nombre: this.form.nombre.trim(),
        descripcion: this.form.descripcion.trim() || null,
        valorPuntos: Number(this.form.valorPuntos),
        repeticionesMaximasSesion: Number(this.form.repeticionesMaximasSesion),
      })
      .subscribe({
        next: (respuesta) => {
          this.guardando.set(false);
          this.formAbierto.set(false);
          this.toasts.exito(
            respuesta.actividad
              ? '¡Lista! Ya la podés marcar como hecha. 🎉'
              : 'Enviada a tu tutor. Te avisamos cuando la revise. ⏳'
          );
          this.cargar();
        },
        error: (e) => {
          this.toasts.error(mensajeDeError(e));
          this.guardando.set(false);
        },
      });
  }

  protected confirmarArchivar(): void {
    const actividad = this.aArchivar();

    if (!actividad) {
      return;
    }

    this.api.archivarMiActividad(actividad.id).subscribe({
      next: () => {
        this.toasts.exito('Archivada.');
        this.aArchivar.set(null);
        this.cargar();
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.aArchivar.set(null);
      },
    });
  }

  private cargar(): void {
    const grupoId = this.auth.grupoUsuario();

    if (!grupoId) {
      this.cargando.set(false);

      return;
    }

    this.cargando.set(true);
    this.api.misActividades(grupoId).subscribe({
      next: (datos) => {
        this.datos.set(datos);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
