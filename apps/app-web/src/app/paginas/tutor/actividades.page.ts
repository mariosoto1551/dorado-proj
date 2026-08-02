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
import { RouterLink } from '@angular/router';
import { type Observable, of, switchMap } from 'rxjs';

import {
  type ActividadDto,
  AlcanceActividad,
  ComportamientoAlCierre,
  type ConfiguracionContenidoGrupoDto,
  EstadoPropuesta,
  ModoCreacionContenidoUsuario,
  type PropuestaActividadDto,
  type RolGrupoDto,
  type TurnoActividadDto,
  type UsuarioDto,
  TipoLimiteTiempo,
  TipoPuntaje,
} from '@dorado/shared-types';
import { ConfirmDialogComponent, EstadoVacioComponent, CampoComponent, ModalComponent } from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { TurnosActividadComponent } from './turnos-actividad.component';
import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import type { CrearActividadRequest } from '../../core/api/api.types';
import { mensajeDeError } from '../../core/api/errores';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { describirDias, DIAS_SEMANA } from '../../core/dias-semana';
import { sinIntegrantesConEsosRoles } from '../../core/roles-grupo';
import { accionDeTurno, type EstadoTurnoForm, textoDelChipDeTurno } from '../../core/turnos';

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
  /** fase-14-19: ids de RolGrupo que la pueden ver; vacío = la ven todos. */
  rolesPermitidos: string[];
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
  rolesPermitidos: [],
};

/** CRUD de Actividades (fase-10). Form con campos condicionales por tipoLimiteTiempo. */
@Component({
  selector: 'app-actividades',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    EncabezadoPaginaComponent,
    IconoComponent,
    ConfirmDialogComponent,
    TurnosActividadComponent,
    ModalComponent,
    CampoComponent,
    EstadoVacioComponent,
  ],
  template: `
    <section class="mx-auto max-w-4xl px-4 py-6">
      <app-encabezado-pagina titulo="Actividades" subtitulo="Lo que suma puntos cada sesión.">
        <button
          type="button"
          (click)="abrirNueva()"
          class="boton boton-primario"
        >
          <span class="h-4 w-4"><app-icono nombre="plus" /></span>
          Nueva
        </button>
      </app-encabezado-pagina>

      <!-- fase-14-23 T3: los dos interruptores que vivían acá (contenido de los
           integrantes y plan del día) se mudaron al hub de configuración. Queda
           la línea de estado para que quien los buscaba acá no se quede sin
           rastro. -->
      <a
        [routerLink]="['/grupos', grupoId(), 'configuracion']"
        class="mt-4 flex items-center gap-2 text-xs text-slate-500 transition hover:text-marca-600 dark:text-slate-400 dark:hover:text-marca-300"
      >
        <span class="h-3.5 w-3.5 shrink-0"><app-icono nombre="cog" /></span>
        <span class="min-w-0 truncate">{{ resumenAjustes() }}</span>
        <span class="shrink-0 font-semibold">Ajustes →</span>
      </a>

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
          <ui-estado-vacio class="mt-6">
            @if (modoActual() === MC.RESTRICTIVO) {
              Los integrantes no pueden crear actividades todavía. Se habilita en
              <a
                [routerLink]="['/grupos', grupoId(), 'configuracion']"
                class="font-semibold text-marca-600 hover:underline dark:text-marca-300"
                >Configuración del grupo</a
              >.
            } @else {
              Nadie propuso nada por ahora.
            }
          </ui-estado-vacio>
        } @else {
          <ul class="mt-5 space-y-3">
            @for (p of propuestas(); track p.id) {
              <li class="tarjeta">
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
                      <ui-campo etiqueta="Motivo del rechazo (opcional — el integrante lo va a leer)">
                        <textarea
                          [(ngModel)]="motivoRechazo"
                          name="motivoRechazo"
                          rows="2"
                          maxlength="500"
                          class="campo"
                        ></textarea>
                      </ui-campo>
                      <div class="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          (click)="rechazando.set(null)"
                          class="boton boton-neutro boton-sm"
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
                        class="boton boton-neutro boton-sm"
                      >
                        Rechazar
                      </button>
                      <button
                        type="button"
                        (click)="aprobar(p)"
                        [disabled]="resolviendo() === p.id"
                        class="boton boton-primario boton-sm"
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
        <ui-estado-vacio class="mt-6">
          Todavía no hay actividades. Creá la primera.
        </ui-estado-vacio>
      } @else {
        <ul class="mt-5 grid gap-3 sm:grid-cols-2">
          @for (a of actividades(); track a.id) {
            <li class="flex flex-col tarjeta">
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
                <!-- fase-14-19: a qué roles está restringida -->
                @for (rolId of a.rolesPermitidos; track rolId) {
                  <span
                    class="rounded-full px-2 py-0.5 font-semibold text-white"
                    [style.background-color]="rolDe(rolId)?.colorHex ?? '#64748B'"
                    title="Solo la ven los integrantes con este rol"
                  >
                    🏷 {{ rolDe(rolId)?.nombre ?? 'rol archivado' }}
                  </span>
                }
                @if (sinNadieConEsosRoles(a)) {
                  <span
                    class="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                    title="Ningún integrante tiene los roles que pide"
                  >
                    ⚠ hoy no la ve nadie
                  </span>
                }
                <!-- fase-14-23: sin este chip no había forma de saber, desde la
                     lista, si una obligatoria rota o es de todos. Su ausencia
                     es la que dice «es de todos» (decisión 2). -->
                @if (chipDeTurno(a); as texto) {
                  <span
                    class="rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
                    [title]="tituloDelChipDeTurno(a)"
                  >
                    🔁 {{ texto }}
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
    <ui-modal
      [abierto]="formAbierto()"
      [titulo]="editando() ? 'Editar actividad' : 'Nueva actividad'"
      ancho="lg"
      (cerrar)="cerrarForm()"
    >
      @if (formAbierto()) {
        <form (submit)="guardar($event)">
  
            <div class="mt-4 space-y-3">
              <ui-campo etiqueta="Nombre">
                <input
                  [(ngModel)]="form.nombre"
                  name="nombre"
                  required
                  maxlength="120"
                  class="campo"
                />
              </ui-campo>
  
              <ui-campo etiqueta="Descripción (opcional)">
                <textarea
                  [(ngModel)]="form.descripcion"
                  name="descripcion"
                  rows="2"
                  maxlength="1000"
                  class="campo"
                ></textarea>
              </ui-campo>
  
              <ui-campo etiqueta="Alcance">
                <select
                  [(ngModel)]="form.alcance"
                  name="alcance"
                  class="campo"
                >
                  <option [ngValue]="AA.INDIVIDUAL">Individual</option>
                  <option [ngValue]="AA.EQUIPO">Equipo</option>
                </select>
              </ui-campo>
  
              @if (form.alcance === AA.EQUIPO) {
                <div class="rounded-lg bg-teal-50 p-3 text-xs text-teal-800 animate-fade-in dark:bg-teal-500/10 dark:text-teal-200">
                  👥 La completa el <strong>jefe</strong> del equipo una vez y los puntos se reparten a cada integrante. Las tareas de equipo son opcionales (suman).
                </div>
                <div class="grid grid-cols-2 gap-3 animate-fade-in">
                  <ui-campo etiqueta="Puntos por integrante">
                    <input
                      [(ngModel)]="form.valorPuntos"
                      name="valorPuntos"
                      type="number"
                      min="1"
                      required
                      class="campo"
                    />
                  </ui-campo>
                  <ui-campo etiqueta="Bono al jefe">
                    <input
                      [(ngModel)]="form.bonoJefePuntos"
                      name="bonoJefePuntos"
                      type="number"
                      min="0"
                      class="campo"
                    />
                  </ui-campo>
                </div>
              } @else {
                <div class="grid grid-cols-2 gap-3">
                  <ui-campo etiqueta="Puntos">
                    <input
                      [(ngModel)]="form.valorPuntos"
                      name="valorPuntos"
                      type="number"
                      min="1"
                      required
                      class="campo"
                    />
                  </ui-campo>
                  <ui-campo etiqueta="Tipo">
                    <select
                      [(ngModel)]="form.tipoPuntaje"
                      name="tipoPuntaje"
                      class="campo"
                    >
                      <option [ngValue]="TP.OPCIONAL">Opcional</option>
                      <option [ngValue]="TP.OBLIGATORIA">Obligatoria</option>
                    </select>
                  </ui-campo>
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
                  <ui-campo etiqueta="Puntos por cumplirla" class="animate-fade-in">
                    <input
                      [(ngModel)]="form.puntosPorCumplir"
                      name="puntosPorCumplir"
                      type="number"
                      min="0"
                      class="campo"
                    />
                    <span class="block text-xs text-slate-500 dark:text-slate-400">
                      Lo que gana si la hace. Dejalo en 0 si cumplir es solo evitar el descuento.
                      @if (form.puntosPorCumplir > 0) {
                        <strong class="text-slate-600 dark:text-slate-300">
                          Queda +{{ form.puntosPorCumplir }} si la hace, −{{ form.valorPuntos }} si no.
                        </strong>
                      }
                    </span>
                  </ui-campo>
                }
              }
  
              <ui-campo etiqueta="Límite de tiempo">
                <select
                  [(ngModel)]="form.tipoLimiteTiempo"
                  name="tipoLimiteTiempo"
                  class="campo"
                >
                  <option [ngValue]="TLT.SIN_LIMITE">Sin límite</option>
                  <option [ngValue]="TLT.DEADLINE">Hora límite (deadline)</option>
                  <option [ngValue]="TLT.CRONOMETRO">Cronómetro</option>
                </select>
              </ui-campo>
  
              @if (form.tipoLimiteTiempo === TLT.DEADLINE) {
                <ui-campo etiqueta="Hora límite (HH:mm)" class="animate-fade-in">
                  <input
                    [(ngModel)]="form.deadlineHora"
                    name="deadlineHora"
                    type="time"
                    class="campo"
                  />
                </ui-campo>
              }
  
              @if (form.tipoLimiteTiempo === TLT.CRONOMETRO) {
                <ui-campo etiqueta="Duración (minutos)" class="animate-fade-in">
                  <input
                    [(ngModel)]="form.duracionCronometroMinutos"
                    name="duracionCronometroMinutos"
                    type="number"
                    min="1"
                    class="campo"
                  />
                </ui-campo>
              }
  
              <ui-campo etiqueta="Repeticiones máx. por sesión">
                <input
                  [(ngModel)]="form.repeticionesMaximasSesion"
                  name="repeticionesMaximasSesion"
                  type="number"
                  min="1"
                  class="campo"
                />
              </ui-campo>
  
              <!-- fase-14-11: días en que se puede hacer -->
              <div>
                <span class="etiqueta-campo">
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
  
              <!-- fase-14-21: turnos rotativos. Solo OBLIGATORIA individual.
                   fase-14-23: ya no exige estar editando — el armador es
                   controlado y su estado se persiste en el submit, así que la
                   secuencia se puede armar mientras se crea la actividad. -->
              @if (turnosAplican()) {
                <app-turnos-actividad
                  [usuarios]="usuariosDelGrupo()"
                  [roles]="roles()"
                  [turno]="turnoDeLaActividad()"
                  (cambio)="estadoTurno.set($event)"
                />
              }
  
              <!-- fase-14-19: restringir por rol del grupo. Solo INDIVIDUAL -->
              @if (roles().length > 0 && form.alcance === AA.INDIVIDUAL) {
                <div class="animate-fade-in">
                  <span class="etiqueta-campo">
                    Restringir a roles
                  </span>
                  <div class="mt-1.5 flex flex-wrap gap-1.5">
                    @for (rol of roles(); track rol.id) {
                      <button
                        type="button"
                        (click)="alternarRol(rol.id)"
                        [attr.aria-pressed]="form.rolesPermitidos.includes(rol.id)"
                        class="rounded-full border px-3 py-1 text-xs font-semibold transition"
                        [class]="form.rolesPermitidos.includes(rol.id)
                          ? 'border-transparent text-white'
                          : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'"
                        [style.background-color]="
                          form.rolesPermitidos.includes(rol.id) ? rol.colorHex : null
                        "
                      >
                        {{ rol.nombre }}
                      </button>
                    }
                  </div>
                  <p class="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                    @if (form.rolesPermitidos.length === 0) {
                      Sin marcar ninguno, la ven todos los integrantes.
                    } @else {
                      Solo la ven quienes tengan alguno de esos roles — al resto no
                      le aparece, y tampoco se les descuenta si es obligatoria.
                    }
                  </p>
                </div>
              }
  
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
  
          <div class="botonera">
            <button type="button" (click)="cerrarForm()" class="boton boton-neutro">Cancelar</button>
            <button type="submit" [disabled]="guardando()" class="boton boton-primario">
              {{ guardando() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      }
    </ui-modal>

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

  /** Modo guardado en el servidor (para los textos), separado del elegido en el form. */
  protected readonly modoActual = signal<ModoCreacionContenidoUsuario>(
    ModoCreacionContenidoUsuario.RESTRICTIVO
  );

  // ---- fase-14-19: roles del grupo (vacío = el grupo no usa roles) ----
  protected readonly roles = signal<RolGrupoDto[]>([]);

  // ---- fase-14-21: turnos ----
  /** Integrantes del grupo, para armar la secuencia de turnos. */
  protected readonly usuariosDelGrupo = signal<UsuarioDto[]>([]);

  /** Rotación de la actividad en edición, tal como está en el servidor. */
  protected readonly turnoDeLaActividad = signal<TurnoActividadDto | null>(null);

  // ---- fase-14-23 ----
  /** Lo que el armador de turnos tiene en pantalla, todavía sin persistir. */
  protected readonly estadoTurno = signal<EstadoTurnoForm | null>(null);

  /**
   * A quién le toca hoy cada actividad rotativa, por actividadId. Sale de una
   * sola llamada por pantalla (`turnos-de-hoy`), que devuelve lista vacía sin
   * consultar nada si el grupo no usa turnos.
   */
  protected readonly turnosDeHoy = signal<Map<string, string | null>>(new Map());

  // ---- fase-14-17: plan del día ----
  protected readonly planDelDiaActivo = signal(false);

  protected readonly propuestas = signal<PropuestaActividadDto[]>([]);

  protected readonly pendientes = computed(() =>
    this.propuestas().filter((p) => p.estado === EstadoPropuesta.PENDIENTE)
  );

  protected readonly resolviendo = signal<string | null>(null);

  /** id de la propuesta con el textarea de motivo abierto. */
  protected readonly rechazando = signal<string | null>(null);

  protected motivoRechazo = '';

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

  /**
   * fase-14-23 T3: los dos ajustes que definen qué ve el integrante ya no se
   * editan acá (se mudaron al hub), pero SÍ deciden qué muestra esta pantalla —
   * el modo habilita la pestaña «Propuestas» y el plan del día habilita
   * «siempre a la vista» en el modal. Se sigue leyendo la config y se resume en
   * una línea, para que quien los buscaba acá tenga por dónde seguir.
   */
  protected resumenAjustes(): string {
    const opcion = OPCIONES_MODO.find((o) => o.modo === this.modoActual());
    const plan = this.planDelDiaActivo() ? 'activado' : 'apagado';

    return `Plan del día: ${plan} · Contenido de los integrantes: ${opcion?.titulo ?? '—'}`;
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
    // fase-14-23: sin rotación previa, pero el bloque ya está disponible al
    // crear — antes había que guardar y volver a abrir para que apareciera.
    this.turnoDeLaActividad.set(null);
    this.estadoTurno.set(null);
    this.formAbierto.set(true);
  }

  protected abrirEditar(a: ActividadDto): void {
    this.editando.set(a);
    // fase-14-21: la rotación se pide aparte (404 = la actividad no rota, que
    // es lo normal). Falla en silencio: es un bloque accesorio del formulario.
    this.turnoDeLaActividad.set(null);
    this.estadoTurno.set(null);

    if (a.tipoPuntaje === TipoPuntaje.OBLIGATORIA) {
      this.api.obtenerTurno(a.id).subscribe({
        next: (turno) => this.turnoDeLaActividad.set(turno),
        error: () => this.turnoDeLaActividad.set(null),
      });
    }

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
      rolesPermitidos: [...a.rolesPermitidos],
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

  /** fase-14-19: marca/desmarca un rol en el form (vacío = la ven todos). */
  protected alternarRol(rolGrupoId: string): void {
    const actuales = this.form.rolesPermitidos;

    this.form.rolesPermitidos = actuales.includes(rolGrupoId)
      ? actuales.filter((id) => id !== rolGrupoId)
      : [...actuales, rolGrupoId];
  }

  /** Nombre y color de un rol, para los chips de la lista del catálogo. */
  protected rolDe(rolGrupoId: string): RolGrupoDto | undefined {
    return this.roles().find((rol) => rol.id === rolGrupoId);
  }

  /** fase-14-19: restringida a roles que hoy no tiene nadie (ver core/roles-grupo). */
  protected sinNadieConEsosRoles(actividad: ActividadDto): boolean {
    return sinIntegrantesConEsosRoles(actividad.rolesPermitidos, this.roles());
  }

  /** fase-14-23: «Hoy: Luciana», «Por turnos», o null si no rota. */
  protected chipDeTurno(actividad: ActividadDto): string | null {
    const turnos = this.turnosDeHoy();

    return textoDelChipDeTurno(turnos.has(actividad.id), turnos.get(actividad.id) ?? null);
  }

  protected tituloDelChipDeTurno(actividad: ActividadDto): string {
    return this.turnosDeHoy().get(actividad.id)
      ? 'Rota entre los integrantes; hoy le toca a esta persona'
      : 'Rota entre los integrantes; todavía no hay turno asignado';
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

  /** El bloque de turnos solo tiene sentido en una obligatoria individual. */
  protected turnosAplican(): boolean {
    return this.form.tipoPuntaje === TipoPuntaje.OBLIGATORIA
      && this.form.alcance === AlcanceActividad.INDIVIDUAL;
  }

  protected guardar(evento: Event): void {
    evento.preventDefault();

    if (this.form.nombre.trim().length === 0) {
      return;
    }

    // fase-14-23: con un solo botón, una rotación activa y vacía ya no queda
    // frenada por un botón deshabilitado — hay que decirlo.
    const turno = this.estadoTurno();

    if (this.turnosAplican() && turno?.activo && turno.secuencia.length === 0) {
      this.toasts.error(
        'Agregá al menos un integrante al turno, o destildá «Por turnos».'
      );

      return;
    }

    this.guardando.set(true);
    const datos = this.armarPayload();
    const actual = this.editando();

    const peticion = actual
      ? this.api.editarActividad(actual.id, datos)
      : this.api.crearActividad(this.grupoId(), datos);

    // fase-14-23: la actividad y sus turnos se guardan con el mismo botón. El
    // turno va SEGUNDO y encadenado porque al crear no hay id hasta que el
    // servidor responde — que es justamente por lo que antes este bloque solo
    // existía al editar.
    peticion
      .pipe(switchMap((guardada) => this.persistirTurno(guardada.id)))
      .subscribe({
        next: () => {
          this.toasts.exito(actual ? 'Actividad actualizada.' : 'Actividad creada.');
          this.guardando.set(false);
          this.formAbierto.set(false);
          this.cargar(this.grupoId());
        },
        error: (e) => {
          this.toasts.error(mensajeDeError(e));
          this.guardando.set(false);
          // La actividad puede haberse guardado y el turno no: recargar deja la
          // pantalla mostrando lo que realmente quedó, no lo que se intentó.
          this.cargar(this.grupoId());
        },
      });
  }

  /**
   * La parte de turnos del submit (fase-14-23). Devuelve un observable que no
   * hace nada cuando no hay nada que mandar, para que el encadenado del submit
   * sea uno solo y no dos caminos distintos según haya turnos o no.
   */
  private persistirTurno(actividadId: string): Observable<unknown> {
    const estado = this.estadoTurno();

    if (!estado || !this.turnosAplican()) {
      return of(null);
    }

    switch (accionDeTurno(this.turnoDeLaActividad(), estado)) {
      case 'guardar':
        return this.api.configurarTurno(actividadId, {
          modo: estado.modo,
          frecuencia: estado.frecuencia,
          activo: true,
          posiciones: estado.secuencia.map((usuarioId) => ({ usuarioId })),
        });
      case 'apagar':
        return this.api.apagarTurno(actividadId);
      default:
        return of(null);
    }
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
      // fase-14-19: una tarea de equipo no se restringe por rol (el backend
      // devolvería 400) — se manda vacío en vez de dejar que el form lo pida.
      rolesPermitidos: esEquipo ? [] : [...f.rolesPermitidos],
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
        // fase-14-21: el armador de turnos necesita los DTO completos (el chip
        // de rol del atajo «todos los del rol X» sale de ahí).
        this.usuariosDelGrupo.set(usuarios);
      },
      error: () => undefined,
    });
    // fase-14-19: sin roles cargados el campo «Restringir a roles» no aparece,
    // que es exactamente lo que corresponde en un grupo que no los usa.
    this.identity.listarRolesGrupo(grupoId).subscribe({
      next: (roles) => this.roles.set(roles),
      error: () => this.roles.set([]),
    });
    // fase-14-23: una sola llamada para toda la lista — el endpoint ya venía
    // resuelto del #21 y ninguna pantalla lo usaba. Solo trae las actividades
    // con rotación ACTIVA, así que estar en el mapa ya significa «rota».
    this.api.turnosDeHoy(grupoId).subscribe({
      next: (filas) => {
        this.turnosDeHoy.set(
          new Map(filas.map((fila) => [fila.actividadId, fila.asignacion?.nombre ?? null]))
        );
      },
      error: () => this.turnosDeHoy.set(new Map()),
    });
  }

  private aplicarConfig(config: ConfiguracionContenidoGrupoDto): void {
    this.modoActual.set(config.modoCreacionUsuario);
    this.planDelDiaActivo.set(config.planDelDiaActivo);
  }
}
