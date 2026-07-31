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

import {
  type ActividadDto,
  AlcanceActividad,
  ComportamientoAlCierre,
  type ConfiguracionContenidoGrupoDto,
  EstadoPropuesta,
  ModoCreacionContenidoUsuario,
  type PropuestaActividadDto,
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
import { IdentityApiService } from '../../core/api/identity-api.service';
import { describirDias, DIAS_SEMANA } from '../../core/dias-semana';

/** Las 3 opciones del ítem 10, con el texto que ve el tutor. */
const OPCIONES_MODO: ReadonlyArray<{
  modo: ModoCreacionContenidoUsuario;
  titulo: string;
  descripcion: string;
}> = [
  {
    modo: ModoCreacionContenidoUsuario.RESTRICTIVO,
    titulo: 'Restrictivo',
    descripcion: 'Solo vos creás actividades. Es el comportamiento de siempre.',
  },
  {
    modo: ModoCreacionContenidoUsuario.BAJO_APROBACION,
    titulo: 'Bajo aprobación',
    descripcion: 'Los integrantes proponen y vos aprobás o rechazás antes de que valga puntos.',
  },
  {
    modo: ModoCreacionContenidoUsuario.LIBRE,
    titulo: 'Libre',
    descripcion: 'Cada integrante crea sus propias actividades y quedan activas al instante.',
  },
];

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
  /** fase-14-20: lo que SUMA cumplirla; solo con requiereConfirmacion. */
  puntosPorCumplir: number;
  /** fase-14-09: EQUIPO = la completa el jefe y se reparte a los integrantes. */
  alcance: AlcanceActividad;
  bonoJefePuntos: number;
  /** fase-14-11: días en que se puede hacer (0=domingo…6=sábado); vacío = todos. */
  diasSemana: number[];
  /** fase-14-17: solo para OPCIONAL individual; con el plan del día activo, se ve sin elegirla. */
  siempreVisible: boolean;
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
  puntosPorCumplir: 0,
  alcance: AlcanceActividad.INDIVIDUAL,
  bonoJefePuntos: 0,
  diasSemana: [],
  siempreVisible: false,
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

      <!-- ===== fase-14-10: contenido creado por los integrantes ===== -->
      <div class="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          (click)="configAbierta.set(!configAbierta())"
          class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
        >
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-slate-900 dark:text-white">
              Contenido de los integrantes
            </span>
            <span class="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
              {{ resumenModo() }}
            </span>
          </span>
          <span
            class="h-4 w-4 shrink-0 text-slate-400 transition-transform"
            [class.rotate-90]="configAbierta()"
          >
            <app-icono nombre="chevron" />
          </span>
        </button>

        @if (configAbierta()) {
          <div class="border-t border-slate-100 p-4 animate-fade-in dark:border-slate-800">
            <div class="space-y-2">
              @for (opcion of OPCIONES_MODO; track opcion.modo) {
                <label
                  class="flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition"
                  [class]="
                    modoElegido() === opcion.modo
                      ? 'border-marca-500 bg-marca-50 dark:border-marca-400 dark:bg-marca-900/20'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60'
                  "
                >
                  <input
                    type="radio"
                    name="modoContenido"
                    [value]="opcion.modo"
                    [checked]="modoElegido() === opcion.modo"
                    (change)="modoElegido.set(opcion.modo)"
                    class="mt-0.5 h-4 w-4 shrink-0 border-slate-300 text-marca-600 focus:ring-marca-200 dark:border-slate-600"
                  />
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {{ opcion.titulo }}
                    </span>
                    <span class="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      {{ opcion.descripcion }}
                    </span>
                  </span>
                </label>
              }
            </div>

            @if (modoElegido() !== MC.RESTRICTIVO) {
              <div class="mt-3 grid grid-cols-2 gap-3 animate-fade-in">
                <label class="block">
                  <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Máx. puntos por actividad
                  </span>
                  <input
                    [(ngModel)]="formConfig.maxPuntosActividadUsuario"
                    name="maxPuntos"
                    type="number"
                    min="1"
                    max="100"
                    class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                  />
                </label>
                <label class="block">
                  <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Máx. activas por integrante
                  </span>
                  <input
                    [(ngModel)]="formConfig.maxActividadesActivasPorUsuario"
                    name="maxActivas"
                    type="number"
                    min="1"
                    max="50"
                    class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                  />
                </label>
              </div>
            }

            <p class="mt-3 text-xs text-slate-400 dark:text-slate-500">
              Cambiar el modo no toca lo que ya crearon: las actividades activas siguen activas y
              las propuestas pendientes se pueden seguir aprobando.
            </p>

            <div class="mt-3 flex justify-end">
              <button
                type="button"
                (click)="guardarConfig()"
                [disabled]="guardandoConfig()"
                class="rounded-lg bg-marca-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
              >
                {{ guardandoConfig() ? 'Guardando…' : 'Guardar' }}
              </button>
            </div>
          </div>
        }
      </div>

      <!-- ===== fase-14-17: plan del día ===== -->
      <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <label class="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            [checked]="planDelDiaActivo()"
            [disabled]="guardandoPlan()"
            (change)="alternarPlanDelDia(!planDelDiaActivo())"
            class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-marca-600 focus:ring-marca-200 disabled:opacity-50 dark:border-slate-600"
          />
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-slate-900 dark:text-white">
              Plan del día
            </span>
            <span class="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              Las opcionales dejan de aparecer en la lista del integrante hasta que él las elige
              (cada día arranca de cero). Las obligatorias, las de equipo y las que marques
              «siempre a la vista» se ven igual.
            </span>
          </span>
        </label>
      </div>

      <!-- ===== Pestañas ===== -->
      <div class="mt-5 flex gap-1 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          (click)="pestania.set('grupo')"
          class="-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition"
          [class]="
            pestania() === 'grupo'
              ? 'border-marca-500 text-marca-700 dark:text-marca-300'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          "
        >
          Del grupo ({{ actividades().length }})
        </button>
        <button
          type="button"
          (click)="pestania.set('propuestas')"
          class="-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition"
          [class]="
            pestania() === 'propuestas'
              ? 'border-marca-500 text-marca-700 dark:text-marca-300'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          "
        >
          Propuestas
          @if (pendientes().length > 0) {
            <span class="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {{ pendientes().length }}
            </span>
          }
        </button>
      </div>

      @if (pestania() === 'propuestas') {
        @if (propuestas().length === 0) {
          <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            @if (modoActual() === MC.RESTRICTIVO) {
              Los integrantes no pueden crear actividades todavía. Cambiá el modo arriba para
              habilitarlo.
            } @else {
              Nadie propuso nada por ahora.
            }
          </div>
        } @else {
          <ul class="mt-5 space-y-3">
            @for (p of propuestas(); track p.id) {
              <li class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-slate-900 dark:text-white">{{ p.nombre }}</p>
                    <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      de {{ nombreDe(p.creadaPorUsuarioId) }} ·
                      {{ p.repeticionesMaximasSesion }}× por sesión
                    </p>
                    @if (p.descripcion) {
                      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ p.descripcion }}</p>
                    }
                    @if (p.estado === 'RECHAZADA' && p.motivoRechazo) {
                      <p class="mt-1 text-xs text-red-600 dark:text-red-400">
                        Motivo: {{ p.motivoRechazo }}
                      </p>
                    }
                  </div>
                  <span class="shrink-0 rounded-full bg-marca-50 px-2.5 py-1 text-sm font-bold text-marca-700 dark:bg-marca-900/40 dark:text-marca-300">
                    +{{ p.valorPuntos }}
                  </span>
                </div>

                @if (p.estado === 'PENDIENTE') {
                  @if (rechazando() === p.id) {
                    <div class="mt-3 border-t border-slate-50 pt-3 animate-fade-in dark:border-slate-800">
                      <label class="block">
                        <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Motivo del rechazo (opcional — el integrante lo va a leer)
                        </span>
                        <textarea
                          [(ngModel)]="motivoRechazo"
                          name="motivoRechazo"
                          rows="2"
                          maxlength="500"
                          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                        ></textarea>
                      </label>
                      <div class="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          (click)="rechazando.set(null)"
                          class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          (click)="confirmarRechazo(p)"
                          [disabled]="resolviendo() === p.id"
                          class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                        >
                          Confirmar rechazo
                        </button>
                      </div>
                    </div>
                  } @else {
                    <div class="mt-3 flex justify-end gap-2 border-t border-slate-50 pt-3 dark:border-slate-800">
                      <button
                        type="button"
                        (click)="pedirRechazo(p)"
                        [disabled]="resolviendo() === p.id"
                        class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Rechazar
                      </button>
                      <button
                        type="button"
                        (click)="aprobar(p)"
                        [disabled]="resolviendo() === p.id"
                        class="rounded-lg bg-marca-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
                      >
                        Aprobar
                      </button>
                    </div>
                  }
                } @else {
                  <p class="mt-2 text-xs font-semibold" [class]="claseEstado(p)">
                    {{ etiquetaEstado(p) }}
                  </p>
                }
              </li>
            }
          </ul>
        }
      } @else if (cargando()) {
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
                  <!-- fase-14-20: con premio se muestran los dos números. -->
                  @if (a.puntosPorCumplir > 0) {
                    <span
                      class="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-sm font-bold dark:bg-slate-800"
                      title="Suma si la hace, resta si no"
                    >
                      <span class="text-emerald-600 dark:text-emerald-400">+{{ a.puntosPorCumplir }}</span>
                      <span class="text-slate-400 dark:text-slate-500">/</span>
                      <span class="text-red-600 dark:text-red-400">−{{ a.valorPuntos }}</span>
                    </span>
                  } @else {
                    <span
                      class="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-sm font-bold text-red-600 dark:bg-red-500/15 dark:text-red-400"
                      title="Resta puntos si no se hace"
                    >
                      −{{ a.valorPuntos }}
                    </span>
                  }
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
                @if (a.siempreVisible) {
                  <span
                    class="rounded-full bg-marca-100 px-2 py-0.5 font-semibold text-marca-700 dark:bg-marca-500/20 dark:text-marca-300"
                    title="Con el plan del día activo, esta no hay que elegirla"
                  >
                    📌 Siempre a la vista
                  </span>
                }
                @if (a.diasSemana.length > 0) {
                  <span
                    class="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"
                    title="Solo se puede hacer esos días"
                  >
                    🗓 {{ describir(a.diasSemana) }}
                  </span>
                }
                @if (a.origen === 'USUARIO') {
                  <span
                    class="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                    title="Actividad personal: solo su autor la ve y la completa"
                  >
                    de {{ nombreDe(a.creadaPorUsuarioId) }}
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

              <!-- fase-14-20: el premio solo existe si hay algo que confirmar. -->
              @if (form.requiereConfirmacion) {
                <label class="block animate-fade-in">
                  <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Puntos por cumplirla
                  </span>
                  <input
                    [(ngModel)]="form.puntosPorCumplir"
                    name="puntosPorCumplir"
                    type="number"
                    min="0"
                    class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                  />
                  <span class="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                    Lo que gana si la hace. Dejalo en 0 si cumplir es solo evitar el descuento.
                    @if (form.puntosPorCumplir > 0) {
                      <strong class="text-slate-600 dark:text-slate-300">
                        Queda +{{ form.puntosPorCumplir }} si la hace, −{{ form.valorPuntos }} si no.
                      </strong>
                    }
                  </span>
                </label>
              }
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

            <!-- fase-14-11: días en que se puede hacer -->
            <div>
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                ¿Qué días se puede hacer?
              </span>
              <div class="mt-1.5 flex flex-wrap gap-1.5">
                @for (d of DIAS; track d.valor) {
                  <button
                    type="button"
                    (click)="alternarDia(d.valor)"
                    class="rounded-lg border px-3 py-1.5 text-xs font-semibold transition"
                    [class]="
                      form.diasSemana.includes(d.valor)
                        ? 'border-marca-500 bg-marca-600 text-white'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    "
                  >
                    {{ d.etiqueta }}
                  </button>
                }
              </div>
              <p class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {{ resumenDias() }}
                @if (form.diasSemana.length === 0) {
                  <span class="text-slate-400 dark:text-slate-500">— sin marcar ninguno, se puede todos los días.</span>
                }
              </p>
            </div>

            <!-- fase-14-17: solo tiene efecto con el plan del día del grupo activo -->
            @if (form.alcance === AA.INDIVIDUAL && form.tipoPuntaje === TP.OPCIONAL) {
              <label
                class="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 animate-fade-in dark:border-slate-700 dark:bg-slate-800/50"
              >
                <input
                  [(ngModel)]="form.siempreVisible"
                  name="siempreVisible"
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-marca-600 focus:ring-marca-200 dark:border-slate-600"
                />
                <span class="text-xs text-slate-600 dark:text-slate-300">
                  <span class="font-semibold text-slate-700 dark:text-slate-100">📌 Siempre a la vista</span>
                  <span class="mt-0.5 block text-slate-500 dark:text-slate-400">
                    @if (planDelDiaActivo()) {
                      Aparece en la lista del integrante sin que tenga que elegirla.
                    } @else {
                      Solo aplica si activás el «Plan del día» del grupo (arriba).
                    }
                  </span>
                </span>
              </label>
            }
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

  protected readonly MC = ModoCreacionContenidoUsuario;

  protected readonly OPCIONES_MODO = OPCIONES_MODO;

  protected readonly DIAS = DIAS_SEMANA;

  private readonly api = inject(ActivityApiService);

  private readonly identity = inject(IdentityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly actividades = signal<ActividadDto[]>([]);

  // ---- fase-14-10 ----
  protected readonly pestania = signal<'grupo' | 'propuestas'>('grupo');

  protected readonly configAbierta = signal(false);

  protected readonly guardandoConfig = signal(false);

  /** Modo guardado en el servidor (para los textos), separado del elegido en el form. */
  protected readonly modoActual = signal<ModoCreacionContenidoUsuario>(
    ModoCreacionContenidoUsuario.RESTRICTIVO
  );

  protected readonly modoElegido = signal<ModoCreacionContenidoUsuario>(
    ModoCreacionContenidoUsuario.RESTRICTIVO
  );

  // ---- fase-14-17: plan del día ----
  protected readonly planDelDiaActivo = signal(false);

  protected readonly guardandoPlan = signal(false);

  protected readonly propuestas = signal<PropuestaActividadDto[]>([]);

  protected readonly pendientes = computed(() =>
    this.propuestas().filter((p) => p.estado === EstadoPropuesta.PENDIENTE)
  );

  protected readonly resolviendo = signal<string | null>(null);

  /** id de la propuesta con el textarea de motivo abierto. */
  protected readonly rechazando = signal<string | null>(null);

  protected motivoRechazo = '';

  protected formConfig = {
    maxPuntosActividadUsuario: 5,
    maxActividadesActivasPorUsuario: 5,
  };

  private readonly nombresPorUsuario = signal<Record<string, string>>({});

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

  // ---- fase-14-10: contenido de los integrantes ----

  protected resumenModo(): string {
    const opcion = OPCIONES_MODO.find((o) => o.modo === this.modoActual());

    return opcion ? `${opcion.titulo} — ${opcion.descripcion}` : '';
  }

  /** Nombre del integrante autor; su id como fallback si todavía no cargó. */
  protected nombreDe(usuarioId: string | null): string {
    if (!usuarioId) {
      return 'un integrante';
    }

    return this.nombresPorUsuario()[usuarioId] ?? 'un integrante';
  }

  protected etiquetaEstado(p: PropuestaActividadDto): string {
    if (p.estado === EstadoPropuesta.RECHAZADA) {
      return 'Rechazada';
    }

    return p.resueltoPorTipo === 'SYSTEM' ? 'Creada directo (modo libre)' : 'Aprobada';
  }

  protected claseEstado(p: PropuestaActividadDto): string {
    return p.estado === EstadoPropuesta.RECHAZADA
      ? 'text-red-600 dark:text-red-400'
      : 'text-marca-700 dark:text-marca-300';
  }

  protected guardarConfig(): void {
    this.guardandoConfig.set(true);

    this.api
      .actualizarConfiguracionContenido(this.grupoId(), {
        modoCreacionUsuario: this.modoElegido(),
        maxPuntosActividadUsuario: Number(this.formConfig.maxPuntosActividadUsuario),
        maxActividadesActivasPorUsuario: Number(
          this.formConfig.maxActividadesActivasPorUsuario
        ),
      })
      .subscribe({
        next: (config) => {
          this.aplicarConfig(config);
          this.guardandoConfig.set(false);
          this.toasts.exito('Configuración guardada.');
        },
        error: (e) => {
          this.toasts.error(mensajeDeError(e));
          this.guardandoConfig.set(false);
        },
      });
  }

  /**
   * fase-14-17: enciende/apaga el plan del día del grupo. Guarda al instante (es
   * un solo interruptor, no un formulario) y revierte el switch si falla.
   */
  protected alternarPlanDelDia(activo: boolean): void {
    this.guardandoPlan.set(true);
    this.planDelDiaActivo.set(activo);

    this.api
      .actualizarConfiguracionContenido(this.grupoId(), { planDelDiaActivo: activo })
      .subscribe({
        next: (config) => {
          this.aplicarConfig(config);
          this.guardandoPlan.set(false);
          this.toasts.exito(
            activo
              ? 'Plan del día activado: cada integrante elige sus opcionales.'
              : 'Plan del día desactivado: vuelven a verse todas.'
          );
        },
        error: (e) => {
          this.planDelDiaActivo.set(!activo);
          this.toasts.error(mensajeDeError(e));
          this.guardandoPlan.set(false);
        },
      });
  }

  protected aprobar(p: PropuestaActividadDto): void {
    this.resolviendo.set(p.id);

    this.api.aprobarPropuesta(p.id).subscribe({
      next: () => {
        this.toasts.exito(`«${p.nombre}» aprobada.`);
        this.resolviendo.set(null);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.resolviendo.set(null);
      },
    });
  }

  protected pedirRechazo(p: PropuestaActividadDto): void {
    this.motivoRechazo = '';
    this.rechazando.set(p.id);
  }

  protected confirmarRechazo(p: PropuestaActividadDto): void {
    const motivo = this.motivoRechazo.trim();

    this.resolviendo.set(p.id);

    this.api.rechazarPropuesta(p.id, motivo || undefined).subscribe({
      next: () => {
        this.toasts.exito(`«${p.nombre}» rechazada.`);
        this.resolviendo.set(null);
        this.rechazando.set(null);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.resolviendo.set(null);
      },
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
      puntosPorCumplir: a.puntosPorCumplir,
      alcance: a.alcance,
      bonoJefePuntos: a.bonoJefePuntos,
      diasSemana: [...a.diasSemana],
      siempreVisible: a.siempreVisible,
    };
    this.formAbierto.set(true);
  }

  /** fase-14-11: marca/desmarca un día en el form (vacío = todos los días). */
  protected alternarDia(valor: number): void {
    const actuales = this.form.diasSemana;

    this.form.diasSemana = actuales.includes(valor)
      ? actuales.filter((dia) => dia !== valor)
      : [...actuales, valor];
  }

  protected resumenDias(): string {
    return describirDias(this.form.diasSemana);
  }

  protected describir(dias: number[]): string {
    return describirDias(dias);
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
      // fase-14-11: vacío = todos los días (el backend normaliza igual).
      diasSemana: [...f.diasSemana],
      // fase-14-17: solo significa algo en una OPCIONAL individual; en cualquier
      // otro caso el backend lo fuerza a false igual.
      siempreVisible: !esEquipo && f.tipoPuntaje === TipoPuntaje.OPCIONAL && f.siempreVisible,
      // Solo una OBLIGATORIA puede requerir confirmación; para OPCIONAL el
      // backend fuerza ASUME_HECHA igual (fase-14-08).
      comportamientoAlCierre:
        f.tipoPuntaje === TipoPuntaje.OBLIGATORIA && f.requiereConfirmacion
          ? ComportamientoAlCierre.REQUIERE_CONFIRMACION
          : ComportamientoAlCierre.ASUME_HECHA,
      // fase-14-20: solo hay premio si hay confirmación; el backend lo fuerza a
      // 0 igual, pero mandarlo coherente evita que el form muestre un número
      // que el servidor va a descartar.
      puntosPorCumplir:
        !esEquipo && f.tipoPuntaje === TipoPuntaje.OBLIGATORIA && f.requiereConfirmacion
          ? Number(f.puntosPorCumplir)
          : 0,
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

    // fase-14-10: config vigente, propuestas y nombres de los integrantes (para
    // mostrar "de <nombre>" en vez de un uuid). Fallan en silencio: son
    // accesorios de la pantalla, no deben romper el listado del catálogo.
    this.api.obtenerConfiguracionContenido(grupoId).subscribe({
      next: (config) => this.aplicarConfig(config),
      error: () => undefined,
    });
    this.api.listarPropuestas(grupoId).subscribe({
      next: (p) => this.propuestas.set(p),
      error: () => undefined,
    });
    this.identity.listarUsuarios(grupoId).subscribe({
      next: (usuarios) => {
        this.nombresPorUsuario.set(
          Object.fromEntries(usuarios.map((u) => [u.id, u.nombre]))
        );
      },
      error: () => undefined,
    });
  }

  private aplicarConfig(config: ConfiguracionContenidoGrupoDto): void {
    this.modoActual.set(config.modoCreacionUsuario);
    this.modoElegido.set(config.modoCreacionUsuario);
    this.planDelDiaActivo.set(config.planDelDiaActivo);
    this.formConfig = {
      maxPuntosActividadUsuario: config.maxPuntosActividadUsuario,
      maxActividadesActivasPorUsuario: config.maxActividadesActivasPorUsuario,
    };
  }
}
