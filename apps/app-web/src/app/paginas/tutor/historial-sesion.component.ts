import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Observable } from 'rxjs';

import { ConfirmDialogComponent, EstadoVacioComponent, ModalComponent } from '@dorado/shared-ui';
import {
  type ConductaDto,
  EstadoSesion,
  type EventoHistorialDto,
  FiltroTipoHistorial,
  type HistorialSesionDto,
  TipoEventoHistorial,
  type UsuarioDto,
} from '@dorado/shared-types';

import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import { mensajeDeError } from '../../core/api/errores';
import {
  MAX_LARGO_NOTA,
  acentoDeEvento,
  admiteAcciones,
  etiquetaDeEvento,
  formatearHora,
  iconoDeEvento,
  tipoDeRegistro,
} from './historial-sesion.util';

const MS_AUTO_REFRESCO = 30_000;

/**
 * Historial de la sesión (fase-14-18): la línea de tiempo del grupo, con las
 * acciones del tutor sobre cada fila.
 *
 * Lo anulado NO se esconde: se muestra atenuado y tachado, con su rastro
 * (decisión 11 de la spec). El historial que oculta lo corregido le miente al
 * tutor sobre su propio día — y lo corregido es justo lo que va a querer mirar.
 */
@Component({
  selector: 'app-historial-sesion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, ConfirmDialogComponent, EstadoVacioComponent, FormsModule],
  template: `
    <!-- Filtros -->
    <div class="flex flex-wrap items-center gap-2">
      <select
        [(ngModel)]="usuarioFiltro"
        (ngModelChange)="recargarDesdeCero()"
        class="campo w-auto py-1.5 text-xs"
        aria-label="Filtrar por participante"
      >
        <option value="">Todos</option>
        @for (u of usuarios(); track u.id) {
          <option [value]="u.id">{{ u.nombre }}</option>
        }
      </select>

      @for (chip of chips; track chip.valor) {
        <button
          type="button"
          (click)="cambiarTipo(chip.valor)"
          [class]="
            tipoFiltro() === chip.valor
              ? 'rounded-full bg-marca-600 px-3 py-1.5 text-xs font-semibold text-white'
              : 'rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
          "
        >
          {{ chip.etiqueta }}
        </button>
      }

      <label class="ml-auto flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <input
          type="checkbox"
          [(ngModel)]="ocultarAnuladas"
          (ngModelChange)="recargarDesdeCero()"
          class="rounded border-slate-300 dark:border-slate-700"
        />
        Ocultar anuladas
      </label>

      <button
        type="button"
        (click)="recargarDesdeCero()"
        [disabled]="cargando()"
        class="boton boton-neutro boton-sm"
        aria-label="Refrescar"
        title="Refrescar"
      >
        ↻
      </button>
    </div>

    <!--
      fase-14-34: los ajustes de puntos son la única fuente del timeline que
      vive en otro servicio. Si no contesta, la lista sale igual —tres fuentes
      de cuatro es mejor que una pantalla vacía— pero **hay que decirlo**: un
      historial callado afirmaría «hoy no hubo ningún ajuste», que es justo la
      mentira que este ítem vino a sacar del medio.
    -->
    @if (!ajustesDisponibles()) {
      <p
        role="status"
        class="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300"
      >
        <span class="flex-1">
          No se pudieron traer los puntos cargados a mano: si hubo alguno hoy, puede estar
          faltando en esta lista. El resto de lo que ves está completo.
        </span>
        <button
          type="button"
          (click)="recargarDesdeCero()"
          [disabled]="cargando()"
          class="boton boton-peligro boton-sm"
        >
          Reintentar
        </button>
      </p>
    }

    @if (soloLectura()) {
      <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
        La sección ya está cerrada: esto es lo que pasó, en solo lectura.
      </p>
    } @else if (esDiaCerrado()) {
      <p
        role="status"
        class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
      >
        Estás viendo la sesión {{ sesionNumero() ?? '' }}, que ya cerró. Podés corregirla: lo que
        cargues queda marcado como cargado después y pide un motivo.
      </p>
    }

    @if (cargando() && eventos().length === 0) {
      <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
    } @else if (eventos().length === 0) {
      <ui-estado-vacio class="mt-6">
        <p class="text-sm text-slate-500 dark:text-slate-400">
          {{ sinSesion() ? 'Todavía no hay una sesión en curso.' : 'Todavía no pasó nada hoy.' }}
        </p>
      </ui-estado-vacio>
    } @else {
      <ol class="mt-3 space-y-1.5" aria-live="polite">
        @for (evento of eventos(); track evento.id) {
          <li
            class="flex items-start gap-3 rounded-xl border p-3 transition"
            [class]="
              evento.anulado
                ? 'border-slate-200 bg-slate-50/60 opacity-60 dark:border-slate-800 dark:bg-slate-900/40'
                : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
            "
          >
            <span class="mt-0.5 flex-none text-base" [attr.aria-hidden]="true">{{ icono(evento) }}</span>

            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span class="font-mono text-xs text-slate-400 dark:text-slate-500">
                  {{ hora(evento) }}
                </span>
                <span class="font-semibold text-slate-800 dark:text-slate-100">
                  {{ evento.usuarioNombre ?? evento.equipoNombre }}
                </span>
                <span
                  class="truncate text-slate-600 dark:text-slate-300"
                  [class.line-through]="evento.anulado"
                >
                  {{ evento.itemNombre }}
                </span>
              </p>

              <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                <span [class]="acento(evento)">{{ etiqueta(evento) }}</span>
                <span>· {{ evento.registradoPorNombre }}</span>
                @if (evento.tipo === 'TAREA_EQUIPO' && evento.bonoJefe) {
                  <span>· bono jefe +{{ evento.bonoJefe }}</span>
                }
                @if (evento.anulado) {
                  <span class="font-semibold text-red-600 dark:text-red-400">
                    · Anulada por {{ evento.anuladoPorNombre }}
                  </span>
                }
                @if (evento.revertidoEn) {
                  <span class="font-semibold text-emerald-600 dark:text-emerald-400">· Deshecha</span>
                }
                <!-- fase-14-33: se distingue de «Anulada» por color e icono,
                     no solo por el texto (accesibilidad, decisión del #18). -->
                @if (evento.cargadoRetroactivamenteEn) {
                  <span class="font-semibold text-violet-600 dark:text-violet-400">
                    · ⏱ Cargado después
                  </span>
                }
              </p>

              @if (evento.motivoTutor) {
                <p class="mt-0.5 truncate text-xs italic text-slate-500 dark:text-slate-400">
                  «{{ evento.motivoTutor }}»
                </p>
              }

              @if (evento.motivoRetroactivo) {
                <p class="mt-0.5 truncate text-xs italic text-violet-600 dark:text-violet-400">
                  Cargado después: «{{ evento.motivoRetroactivo }}»
                </p>
              }

              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                @if (!soloLectura() && puedeAnular(evento)) {
                  <!-- Sin confirmación a propósito: «Deshacer» aparece al lado
                       apenas se anula (decisión 1 de la T4·2ª). -->
                  <button
                    type="button"
                    (click)="anular(evento)"
                    [disabled]="procesando()"
                    class="boton boton-peligro boton-sm"
                  >
                    Anular
                  </button>
                }
                @if (!soloLectura() && puedeDeshacer(evento)) {
                  <button
                    type="button"
                    (click)="deshacer(evento)"
                    [disabled]="procesando()"
                    class="boton boton-neutro boton-sm"
                  >
                    Deshacer
                  </button>
                }
                @if (admiteAcciones(evento)) {
                  <button
                    type="button"
                    (click)="abrirNotas(evento)"
                    class="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Notas{{ evento.notas.length ? ' (' + evento.notas.length + ')' : '' }}
                  </button>
                }
              </div>
            </div>

            <span
              class="flex-none text-sm font-bold tabular-nums"
              [class]="colorPuntos(evento)"
            >
              {{ textoPuntos(evento) }}
            </span>
          </li>
        }
      </ol>

      @if (cursor()) {
        <button
          type="button"
          (click)="cargarMas()"
          [disabled]="cargando()"
          class="mt-3 w-full boton boton-neutro boton-sm py-2"
        >
          Cargar más
        </button>
      }
    }

    <ui-confirm-dialog
      [abierto]="notaABorrar() !== null"
      titulo="Borrar la nota"
      mensaje="La nota se borra para siempre: no hay papelera. Los otros tutores dejan de verla."
      textoConfirmar="Borrar"
      (confirmar)="confirmarBorrarNota()"
      (cancelar)="notaABorrar.set(null)"
    />

    <!-- fase-14-33: corregir una fila de un día que ya cerró exige decir por
         qué. En la sesión abierta estas dos acciones siguen siendo de un clic,
         como desde el #18. -->
    <ui-confirm-dialog
      [abierto]="correccionEnJuego() !== null"
      [titulo]="tituloCorreccion()"
      [mensaje]="mensajeCorreccion()"
      [textoConfirmar]="textoCorreccion()"
      [tono]="correccionEnJuego()?.accion === 'anular' ? 'peligro' : 'primario'"
      [requiereMotivo]="true"
      placeholderMotivo="Motivo — por qué se corrige un día ya cerrado"
      (confirmar)="ejecutarCorreccion($event)"
      (cancelar)="correccionEnJuego.set(null)"
    />

    <!-- fase-14-23 T4·2ª: acá había un SEGUNDO «Registrar conducta rápida»,
         idéntico en función al de la pestaña «Registrar» —que la primera vuelta
         rehízo— pero con otro aspecto y un tono de botón que no existía en
         ninguna otra parte del área. Esta pestaña es para mirar y corregir lo
         que ya pasó; registrar está a un clic, en la otra. -->

    <!-- Hoja de notas internas -->
    <ui-modal
      [abierto]="eventoConNotas() !== null"
      titulo="Notas internas"
      [subtitulo]="'Sobre «' + (eventoConNotas()?.itemNombre ?? '') + '». El integrante no las ve.'"
      (cerrar)="cerrarNotas()"
    >
      @if (eventoConNotas(); as evento) {

          @if (evento.notas.length === 0) {
            <p class="mt-3 text-xs text-slate-400 dark:text-slate-500">Todavía no hay notas.</p>
          } @else {
            <ul class="mt-3 space-y-2">
              @for (nota of evento.notas; track nota.id) {
                <li class="rounded-xl border border-slate-200 p-2.5 dark:border-slate-800">
                  <p class="text-sm text-slate-700 dark:text-slate-200">{{ nota.texto }}</p>
                  <p class="mt-1 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                    <span>{{ nota.autorNombre }} · {{ hora(nota) }}</span>
                    @if (nota.esPropia) {
                      <button
                        type="button"
                        (click)="pedirBorrarNota(nota.id)"
                        [disabled]="procesando()"
                        class="font-semibold text-red-500 transition hover:underline disabled:opacity-40"
                      >
                        Borrar
                      </button>
                    }
                  </p>
                </li>
              }
            </ul>
          }

          <textarea
            [(ngModel)]="textoNota"
            [maxlength]="maxLargoNota"
            rows="3"
            placeholder="Escribí una nota para vos y los otros tutores…"
            class="mt-3 campo"
          ></textarea>
          <div class="mt-2 flex items-center justify-between">
            <span class="text-xs text-slate-400 dark:text-slate-500">
              {{ textoNota.length }}/{{ maxLargoNota }}
            </span>
            <div class="flex gap-2">
              <button type="button" (click)="cerrarNotas()" class="boton boton-neutro boton-sm">
                Cerrar
              </button>
              <button
                type="button"
                (click)="agregarNota()"
                [disabled]="procesando() || !textoNota.trim()"
                class="boton boton-primario boton-sm"
              >
                Agregar
              </button>
            </div>
          </div>
      }
    </ui-modal>
  `,
})
export class HistorialSesionComponent {
  readonly grupoId = input.required<string>();

  /** Los carga el panel operativo: no se vuelven a pedir acá. */
  readonly usuarios = input<UsuarioDto[]>([]);

  readonly conductas = input<ConductaDto[]>([]);

  /**
   * fase-14-33: qué Sesión mirar. La elige el selector del panel operativo, que
   * gobierna las dos pestañas — ver la Sesión 3 en «Registrar» y la 5 acá sería
   * la peor versión de esto. `null` = la de hoy.
   */
  readonly sesionId = input<string | null>(null);

  protected readonly maxLargoNota = MAX_LARGO_NOTA;

  protected readonly chips = [
    { valor: '' as const, etiqueta: 'Todo' },
    { valor: FiltroTipoHistorial.ACTIVIDAD, etiqueta: 'Actividades' },
    { valor: FiltroTipoHistorial.CONDUCTA, etiqueta: 'Conductas' },
    { valor: FiltroTipoHistorial.TAREA_EQUIPO, etiqueta: 'Equipos' },
    // fase-14-34: los puntos cargados a mano, propios o del asistente.
    { valor: FiltroTipoHistorial.AJUSTE, etiqueta: 'Ajustes' },
  ];

  private readonly activity = inject(ActivityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(false);

  protected readonly procesando = signal(false);

  protected readonly eventos = signal<EventoHistorialDto[]>([]);

  protected readonly cursor = signal<string | null>(null);

  protected readonly sesionEstado = signal<EstadoSesion | null>(null);

  /** La que devolvió el servidor (puede no ser la pedida: ver decisión 14). */
  protected readonly sesionMostrada = signal<string | null>(null);

  protected readonly sesionNumero = signal<number | null>(null);

  /**
   * fase-14-33: la Sección vigente admite escritura. Reemplaza a «la Sesión
   * está ABIERTA» como criterio para habilitar los botones — que era la
   * decisión 14 del #18 y este ítem la revisa.
   */
  protected readonly seccionEditable = signal(true);

  /**
   * fase-14-34: scoring contestó. `false` pinta el aviso de arriba — arranca en
   * `true` para no mostrar una alarma mientras carga la primera página.
   */
  protected readonly ajustesDisponibles = signal(true);

  protected readonly timezone = signal('UTC');

  protected readonly tipoFiltro = signal<FiltroTipoHistorial | ''>('');

  protected readonly notaAbiertaId = signal<string | null>(null);

  /** Nota sobre la que pregunta el diálogo de borrado (fase-14-23 T4·2ª). */
  protected readonly notaABorrar = signal<string | null>(null);

  /** fase-14-33: la corrección sobre un día cerrado que espera su motivo. */
  protected readonly correccionEnJuego = signal<{
    accion: 'anular' | 'deshacer';
    evento: EventoHistorialDto;
  } | null>(null);

  protected readonly tituloCorreccion = computed(() => {
    const enJuego = this.correccionEnJuego();

    if (!enJuego) {
      return '';
    }

    return enJuego.accion === 'anular'
      ? `Anular «${enJuego.evento.itemNombre}»`
      : `Deshacer la marca de «${enJuego.evento.itemNombre}»`;
  });

  protected readonly mensajeCorreccion = computed(() => {
    const numero = this.sesionNumero();

    return (
      `Esto corrige la sesión ${numero ?? ''}, que ya cerró. ` +
      'El motivo queda en el historial junto a la fila.'
    );
  });

  protected readonly textoCorreccion = computed(() =>
    this.correccionEnJuego()?.accion === 'anular' ? 'Anular' : 'Deshacer'
  );

  /** Cuántas páginas acumuló el tutor: con más de una se corta el auto-refresco. */
  protected readonly paginas = signal(1);

  protected usuarioFiltro = '';

  protected ocultarAnuladas = false;

  protected textoNota = '';

  protected readonly sinSesion = computed(() => this.sesionMostrada() === null);

  /**
   * fase-14-18 decía «sesión cerrada: se ve, no se toca» (decisión 14).
   * fase-14-33 lo corrige: lo que decide es la **Sección**. Una Sesión cerrada
   * de la Sección vigente sí se corrige — es el ítem entero. Solo queda en
   * solo lectura lo que ya no admite escritura de ningún tipo.
   */
  protected readonly soloLectura = computed(() => !this.seccionEditable());

  /** fase-14-33: el aviso de «estás mirando un día que ya cerró». */
  protected readonly esDiaCerrado = computed(
    () => this.sesionEstado() !== null && this.sesionEstado() !== EstadoSesion.ABIERTA
  );

  /** El evento cuya hoja de notas está abierta, siempre con datos frescos. */
  protected readonly eventoConNotas = computed(() => {
    const id = this.notaAbiertaId();

    return id ? (this.eventos().find((evento) => evento.id === id) ?? null) : null;
  });

  constructor() {
    effect(() => {
      this.grupoId();
      // fase-14-33: cambiar de Sesión en el selector recarga el timeline.
      this.sesionId();
      this.recargarDesdeCero();
    });

    // Auto-refresco suave: se detiene con la pestaña oculta para no golpear la
    // API de fondo, y nunca reordena lo que el tutor ya scrolleó (solo la
    // primera página).
    const intervalo = setInterval(() => {
      // Con más de una página cargada NO se auto-refresca: reemplazar la lista
      // por la primera página le sacaría de abajo lo que el tutor scrolleó.
      // El botón ↻ sigue disponible y sí reinicia.
      const puedeRefrescar =
        document.visibilityState === 'visible' && !this.procesando() && this.paginas() === 1;

      if (puedeRefrescar) {
        this.refrescarPrimeraPagina();
      }
    }, MS_AUTO_REFRESCO);

    inject(DestroyRef).onDestroy(() => clearInterval(intervalo));
  }

  protected icono(evento: EventoHistorialDto): string {
    return iconoDeEvento(evento);
  }

  protected etiqueta(evento: EventoHistorialDto): string {
    return etiquetaDeEvento(evento);
  }

  protected acento(evento: EventoHistorialDto): string {
    return acentoDeEvento(evento);
  }

  protected hora(algo: { ocurridoEn?: string; createdAt?: string }): string {
    return formatearHora(algo.ocurridoEn ?? algo.createdAt ?? '', this.timezone());
  }

  /** Una confirmación de obligatoria vale 0: mostrar «+0» sería ruido. */
  protected textoPuntos(evento: EventoHistorialDto): string {
    if (evento.puntos === 0) {
      return '';
    }

    const signo = evento.puntos > 0 ? '+' : '';
    const sufijo = evento.tipo === TipoEventoHistorial.TAREA_EQUIPO ? ' c/u' : '';

    return `${signo}${evento.puntos}${sufijo}`;
  }

  protected colorPuntos(evento: EventoHistorialDto): string {
    if (evento.anulado) {
      return 'text-slate-400 line-through dark:text-slate-600';
    }

    return evento.puntos < 0
      ? 'text-red-600 dark:text-red-400'
      : 'text-emerald-600 dark:text-emerald-400';
  }

  /** fase-14-34: el ajuste manual no lleva notas ni se anula desde acá. */
  protected admiteAcciones(evento: EventoHistorialDto): boolean {
    return admiteAcciones(evento);
  }

  protected puedeAnular(evento: EventoHistorialDto): boolean {
    if (!admiteAcciones(evento)) {
      return false;
    }

    return !evento.anulado && evento.tipo !== TipoEventoHistorial.ACTIVIDAD_NO_HIZO;
  }

  /** Deshacer una marca roja: una completada anulada, o un «no hizo» vivo. */
  protected puedeDeshacer(evento: EventoHistorialDto): boolean {
    if (evento.tipo === TipoEventoHistorial.CONDUCTA || !admiteAcciones(evento)) {
      // Sin reversión de conductas (fuera de alcance declarado en la spec).
      return false;
    }

    return evento.tipo === TipoEventoHistorial.ACTIVIDAD_NO_HIZO
      ? !evento.anulado
      : evento.anulado;
  }

  protected cambiarTipo(valor: FiltroTipoHistorial | ''): void {
    this.tipoFiltro.set(valor);
    this.recargarDesdeCero();
  }

  protected recargarDesdeCero(): void {
    this.cargar(null);
  }

  protected cargarMas(): void {
    const cursor = this.cursor();

    if (cursor) {
      this.cargar(cursor);
    }
  }

  protected anular(evento: EventoHistorialDto): void {
    // fase-14-33: en un día ya cerrado el servidor exige motivo, así que la
    // acción pasa por el diálogo en vez de fallar con un toast rojo.
    if (this.esDiaCerrado()) {
      this.correccionEnJuego.set({ accion: 'anular', evento });

      return;
    }

    this.ejecutarAnular(evento, '');
  }

  protected deshacer(evento: EventoHistorialDto): void {
    if (this.esDiaCerrado()) {
      this.correccionEnJuego.set({ accion: 'deshacer', evento });

      return;
    }

    this.ejecutarDeshacer(evento, '');
  }

  /** fase-14-33: el diálogo devolvió el motivo (o no hacía falta). */
  protected ejecutarCorreccion(motivo: string): void {
    const enJuego = this.correccionEnJuego();
    this.correccionEnJuego.set(null);

    if (!enJuego) {
      return;
    }

    if (enJuego.accion === 'anular') {
      this.ejecutarAnular(enJuego.evento, motivo);
    } else {
      this.ejecutarDeshacer(enJuego.evento, motivo);
    }
  }

  private ejecutarAnular(evento: EventoHistorialDto, motivo: string): void {
    const texto = motivo.trim() || undefined;
    const peticion =
      evento.tipo === TipoEventoHistorial.CONDUCTA
        ? // La conducta sigue sin aceptar motivo: asimetría declarada fuera de
          // alcance desde el #18, que este ítem hereda tal cual.
          this.activity.eliminarRegistroConducta(evento.id)
        : evento.tipo === TipoEventoHistorial.TAREA_EQUIPO
          ? this.activity.anularTareaEquipo(evento.id, texto)
          : this.activity.eliminarRegistroActividad(evento.id, texto);

    this.ejecutar(peticion, `Se anuló «${evento.itemNombre}».`);
  }

  private ejecutarDeshacer(evento: EventoHistorialDto, motivo: string): void {
    const texto = motivo.trim() || undefined;
    const peticion =
      evento.tipo === TipoEventoHistorial.TAREA_EQUIPO
        ? this.activity.revertirTareaEquipo(evento.id, texto)
        : this.activity.revertirMarca(evento.id, texto);

    this.ejecutar(peticion, `Se deshizo la marca de «${evento.itemNombre}».`);
  }

  protected abrirNotas(evento: EventoHistorialDto): void {
    this.notaAbiertaId.set(evento.id);
    this.textoNota = '';
  }

  protected cerrarNotas(): void {
    this.notaAbiertaId.set(null);
    this.textoNota = '';
  }

  protected agregarNota(): void {
    const evento = this.eventoConNotas();
    const texto = this.textoNota.trim();

    if (!evento || !texto) {
      return;
    }

    this.procesando.set(true);
    this.activity.crearNota(tipoDeRegistro(evento), evento.id, texto).subscribe({
      next: (nota) => {
        // Optimista y local: recargar entera la lista movería el scroll del
        // tutor mientras escribe.
        this.eventos.update((eventos) =>
          eventos.map((fila) =>
            fila.id === evento.id ? { ...fila, notas: [...fila.notas, nota] } : fila
          )
        );
        this.textoNota = '';
        this.procesando.set(false);
      },
      error: (error) => {
        this.toasts.error(mensajeDeError(error));
        this.procesando.set(false);
      },
    });
  }

  /**
   * fase-14-23 T4·2ª: la nota se borra sin vuelta atrás —no hay papelera— así
   * que pasa por el diálogo. Anular una marca, en cambio, sigue siendo de un
   * clic: tiene «Deshacer» al lado (decisión 1 de la vuelta).
   */
  protected pedirBorrarNota(notaId: string): void {
    this.notaABorrar.set(notaId);
  }

  protected confirmarBorrarNota(): void {
    const notaId = this.notaABorrar();
    this.notaABorrar.set(null);

    if (notaId) {
      this.borrarNota(notaId);
    }
  }

  private borrarNota(notaId: string): void {
    this.procesando.set(true);
    this.activity.borrarNota(notaId).subscribe({
      next: () => {
        this.eventos.update((eventos) =>
          eventos.map((fila) => ({
            ...fila,
            notas: fila.notas.filter((nota) => nota.id !== notaId),
          }))
        );
        this.procesando.set(false);
      },
      error: (error) => {
        this.toasts.error(mensajeDeError(error));
        this.procesando.set(false);
      },
    });
  }

  private ejecutar(peticion: Observable<unknown>, ok: string, alTerminar?: () => void): void {
    this.procesando.set(true);
    peticion.subscribe({
      next: () => {
        this.toasts.exito(ok);
        this.procesando.set(false);
        alTerminar?.();
        this.recargarDesdeCero();
      },
      error: (error) => {
        this.toasts.error(mensajeDeError(error));
        this.procesando.set(false);
      },
    });
  }

  private refrescarPrimeraPagina(): void {
    this.pedir(null).subscribe({
      next: (historial) => this.aplicar(historial, true),
      // El auto-refresco falla en silencio: no se le tira un toast al tutor
      // cada 30 s por un hipo de red.
      error: () => undefined,
    });
  }

  private cargar(cursor: string | null): void {
    this.cargando.set(true);
    this.pedir(cursor).subscribe({
      next: (historial) => {
        this.aplicar(historial, cursor === null);
        this.cargando.set(false);
      },
      error: (error) => {
        this.toasts.error(mensajeDeError(error));
        this.cargando.set(false);
      },
    });
  }

  private pedir(cursor: string | null): Observable<HistorialSesionDto> {
    return this.activity.historial(this.grupoId(), {
      usuarioId: this.usuarioFiltro || undefined,
      tipo: this.tipoFiltro() || undefined,
      incluirAnulados: this.ocultarAnuladas ? false : undefined,
      cursor: cursor ?? undefined,
      // fase-14-33: el día que eligió el selector del panel.
      sesionId: this.sesionId() ?? undefined,
    });
  }

  private aplicar(historial: HistorialSesionDto, esPrimeraPagina: boolean): void {
    this.sesionMostrada.set(historial.sesionId);
    this.sesionEstado.set(historial.sesionEstado);
    this.sesionNumero.set(historial.sesionNumero);
    this.seccionEditable.set(historial.seccionEditable);
    this.ajustesDisponibles.set(historial.ajustesDisponibles);
    this.timezone.set(historial.timezoneGrupo);
    this.cursor.set(historial.cursorSiguiente);
    this.eventos.update((previos) =>
      esPrimeraPagina ? historial.eventos : [...previos, ...historial.eventos]
    );
    this.paginas.update((previas) => (esPrimeraPagina ? 1 : previas + 1));
  }
}
