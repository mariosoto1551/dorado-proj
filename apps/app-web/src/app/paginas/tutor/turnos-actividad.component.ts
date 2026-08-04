import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  AvisoPosicionTurno,
  FrecuenciaTurno,
  ModoTurno,
  type RolGrupoDto,
  type TurnoActividadDto,
  type UsuarioDto,
} from '@dorado/shared-types';

import {
  elegiblesParaTurno,
  type EstadoTurnoForm,
  podarSecuencia,
  resumenDeReparto,
} from '../../core/turnos';

/**
 * Armador de la secuencia de turnos de una obligatoria (fase-14-21).
 *
 * Lo que hay que tener presente al leerlo: la secuencia es una **lista ordenada
 * de posiciones**, no un conjunto de participantes. Agregar dos veces a José es
 * lo esperado —le va a tocar el doble— y por eso el selector nunca lo saca de
 * las opciones disponibles.
 *
 * **Es un componente CONTROLADO desde fase-14-23 (T1).** No conoce la API ni el
 * id de la actividad: emite su estado y el formulario que lo contiene lo guarda
 * en su propio submit. Antes tenía botón propio y persistía al instante, lo que
 * producía dos cosas que nadie espera de un formulario — armar la secuencia y
 * apretar el «Guardar» principal no guardaba los turnos, y apretar «Guardar
 * turnos» y después Cancelar los dejaba guardados igual.
 */
@Component({
  selector: 'app-turnos-actividad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
      <label class="flex items-start gap-3">
        <input
          type="checkbox"
          [checked]="activo()"
          (change)="alternarActivo()"
          class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-marca-600 focus:ring-marca-200 dark:border-slate-600"
        />
        <span class="text-xs text-slate-600 dark:text-slate-300">
          <span class="font-semibold text-slate-700 dark:text-slate-100">🔁 Por turnos</span>
          <span class="mt-0.5 block text-slate-500 dark:text-slate-400">
            Cada día le toca a uno. Al resto le aparece la tarea sin botón, con
            el nombre de quien la tiene hoy.
          </span>
        </span>
      </label>

      @if (activo()) {
        <div class="mt-4 animate-fade-in">
          <div class="flex flex-wrap gap-3">
            <label class="flex-1">
              <span class="etiqueta-campo">Orden</span>
              <select
                [ngModel]="modo()"
                (ngModelChange)="modo.set($event)"
                name="modoTurno"
                class="mt-1 campo"
              >
                <option value="ORDEN_FIJO">Tal como lo armo</option>
                <option value="AZAR">Al azar, sin repetir</option>
              </select>
            </label>
            <label class="flex-1">
              <span class="etiqueta-campo">Rota</span>
              <select
                [ngModel]="frecuencia()"
                (ngModelChange)="frecuencia.set($event)"
                name="frecuenciaTurno"
                class="mt-1 campo"
              >
                <option value="SESION">Cada día</option>
                <option value="SECCION">Cada semana</option>
              </select>
            </label>
          </div>

          <!-- La secuencia: lista ordenada, con repetidos permitidos -->
          <span class="mt-4 block etiqueta-campo">
            Orden de los turnos
          </span>

          @if (secuencia().length === 0) {
            <p class="mt-2 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400">
              Agregá integrantes en el orden en que les va a tocar. Podés repetir
              a alguien para que le toque más seguido.
            </p>
          } @else {
            <ul class="mt-2 space-y-1.5">
              @for (posicion of secuencia(); track $index) {
                <li class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <span class="w-5 shrink-0 text-xs font-bold tabular-nums text-slate-400 dark:text-slate-500">
                    {{ $index + 1 }}
                  </span>
                  <span class="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">
                    {{ nombreDe(posicion) }}
                  </span>
                  @if (avisoDe(posicion); as aviso) {
                    <span
                      class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                      [title]="textoAviso(aviso)"
                    >
                      ⚠
                    </span>
                  }
                  <button
                    type="button"
                    (click)="mover($index, -1)"
                    [disabled]="$index === 0"
                    aria-label="Subir"
                    class="rounded px-1.5 py-0.5 text-xs text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    (click)="mover($index, 1)"
                    [disabled]="$index === secuencia().length - 1"
                    aria-label="Bajar"
                    class="rounded px-1.5 py-0.5 text-xs text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    (click)="quitar($index)"
                    aria-label="Quitar"
                    class="rounded px-1.5 py-0.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    ✕
                  </button>
                </li>
              }
            </ul>
          }

          <div class="mt-2 flex gap-2">
            <select
              [ngModel]="aAgregar()"
              (ngModelChange)="aAgregar.set($event)"
              name="agregarTurno"
              class="min-w-0 flex-1 campo"
            >
              <option value="">Elegir integrante…</option>
              @for (usuario of activos(); track usuario.id) {
                <option [value]="usuario.id">{{ usuario.nombre }}</option>
              }
            </select>
            <button
              type="button"
              (click)="agregar()"
              [disabled]="aAgregar() === ''"
              class="shrink-0 boton boton-primario"
            >
              ＋ Agregar
            </button>
          </div>

          <!-- Atajos que PRECARGAN la lista y la dejan editable (decisión 4).
               Con destinatario nominal precargan solo a los destinatarios: el
               pozo sale de ahí (fase-14-24, decisión 6). -->
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              (click)="precargarTodos()"
              class="rounded-full border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {{ destinatarios().length > 0 ? 'los destinatarios' : 'todo el grupo' }}
            </button>
            @for (rol of roles(); track rol.id) {
              <button
                type="button"
                (click)="precargarPorRol(rol.id)"
                class="rounded-full border px-2.5 py-1 text-xs font-semibold transition hover:opacity-80"
                [style.border-color]="rol.colorHex"
                [style.color]="rol.colorHex"
              >
                rol {{ rol.nombre }}
              </button>
            }
          </div>

          @if (resumen(); as texto) {
            <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{{ texto }}</p>
          }

          @if (destinatarios().length > 0) {
            <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Rota solo entre los destinatarios de la actividad. Para sumar a
              alguien más, agregalo primero en «¿Quién la hace?».
            </p>
          }

          @if (secuencia().length === 0) {
            <p class="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
              Agregá al menos un integrante, o destildá «Por turnos» para que la
              actividad vuelva a ser de todos.
            </p>
          }

          <p class="mt-3 text-xs text-slate-400 dark:text-slate-500">
            Se guarda junto con la actividad. Los cambios entran en la vuelta
            siguiente: a quien ya tiene el turno asignado esta vuelta no se le
            cambia el día.
          </p>
        </div>
      }
    </div>
  `,
})
export class TurnosActividadComponent {
  /**
   * El padrón del grupo, con los dados de baja incluidos: hacen falta para que
   * `nombreDe` pueda nombrar a alguien que ya está en la secuencia guardada y
   * que después se desactivó. Para OFRECER se usa `activos()`.
   */
  readonly usuarios = input.required<UsuarioDto[]>();

  readonly roles = input<RolGrupoDto[]>([]);

  /**
   * Los destinatarios de la actividad, cuando es de ciertas personas
   * (fase-14-24). Vacío = de todo el grupo, sin restricción. Acota a quiénes se
   * puede sumar al pozo: el pozo sale del destinatario, no al revés.
   */
  readonly destinatarios = input<string[]>([]);

  /** Configuración ya guardada; null = la actividad todavía no rota. */
  readonly turno = input<TurnoActividadDto | null>(null);

  /** El estado en pantalla, sin persistir. Lo guarda el formulario contenedor. */
  readonly cambio = output<EstadoTurnoForm>();

  protected readonly activo = signal(false);

  protected readonly secuencia = signal<string[]>([]);

  protected readonly modo = signal<ModoTurno>(ModoTurno.ORDEN_FIJO);

  protected readonly frecuencia = signal<FrecuenciaTurno>(FrecuenciaTurno.SESION);

  protected readonly aAgregar = signal('');

  /**
   * A quiénes se puede sumar a la rotación: los de alta que además son
   * destinatarios de la actividad. La regla vive en `core/turnos.ts` con el
   * porqué de cada uno de los dos filtros.
   */
  protected readonly activos = computed(() =>
    elegiblesParaTurno(this.usuarios(), this.destinatarios())
  );

  /** «José: 2 de cada 4 días» — la vista previa del reparto que se armó. */
  protected readonly resumen = computed(() =>
    resumenDeReparto(this.secuencia(), (id) => this.nombreDe(id))
  );

  constructor() {
    // `turno` llega después del primer render: la config de la actividad en
    // edición se pide aparte, y al crear no existe hasta que se guarda.
    effect(() => this.aplicarTurnoExistente(this.turno()));

    // Acotar el destinatario mientras el armador está abierto tiene que sacar
    // del pozo a quien quedó afuera, en el acto: dejarlo en la lista mostraría
    // una rotación que el servidor va a rechazar recién al guardar.
    effect(() => this.podarPorDestinatario(this.destinatarios()));

    // Un solo lugar de emisión: cualquier cambio de los cuatro signals viaja
    // al contenedor, que decide qué hacer con él recién en su submit.
    effect(() => {
      this.cambio.emit({
        activo: this.activo(),
        modo: this.modo(),
        frecuencia: this.frecuencia(),
        secuencia: this.secuencia(),
      });
    });
  }

  protected nombreDe(usuarioId: string): string {
    return this.usuarios().find((usuario) => usuario.id === usuarioId)?.nombre ?? '(sin nombre)';
  }

  protected avisoDe(usuarioId: string): AvisoPosicionTurno | null {
    return this.turno()?.posiciones.find((p) => p.usuarioId === usuarioId)?.aviso ?? null;
  }

  protected textoAviso(aviso: AvisoPosicionTurno): string {
    return aviso === AvisoPosicionTurno.YA_NO_ESTA_EN_EL_GRUPO
      ? 'Ya no está en el grupo — ese turno se saltea'
      : 'No tiene el rol que pide la actividad — ese turno se saltea';
  }

  /**
   * Destildar ya NO apaga la rotación en el acto (fase-14-23): antes salía el
   * DELETE en el mismo `change` del checkbox, sin confirmación y sin vuelta
   * atrás. Ahora solo cambia el estado en pantalla y se aplica al guardar.
   */
  protected alternarActivo(): void {
    this.activo.update((valor) => !valor);
  }

  protected agregar(): void {
    const usuarioId = this.aAgregar();

    if (usuarioId === '') {
      return;
    }

    // Sin quitarlo de las opciones: repetir a alguien es justamente el punto.
    this.secuencia.update((actual) => [...actual, usuarioId]);
    this.aAgregar.set('');
  }

  protected quitar(indice: number): void {
    this.secuencia.update((actual) => actual.filter((_, i) => i !== indice));
  }

  protected mover(indice: number, delta: number): void {
    this.secuencia.update((actual) => {
      const destino = indice + delta;

      if (destino < 0 || destino >= actual.length) {
        return actual;
      }

      const copia = [...actual];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];

      return copia;
    });
  }

  protected precargarTodos(): void {
    this.secuencia.set(this.activos().map((usuario) => usuario.id));
  }

  protected precargarPorRol(rolGrupoId: string): void {
    this.secuencia.set(
      this.activos()
        .filter((usuario) => usuario.rolGrupo?.id === rolGrupoId)
        .map((usuario) => usuario.id)
    );
  }

  /**
   * Sincroniza con lo guardado en el servidor. Sin turno deja el armador en
   * blanco a propósito: el mismo componente se reusa al abrir otra actividad
   * (y al crear una nueva), y conservar la secuencia anterior la ofrecería
   * como si fuera de esta.
   */
  /**
   * Deja en la secuencia solo a los destinatarios. `podarSecuencia` devuelve la
   * misma referencia cuando no hay nada que sacar, así que el `update` no
   * escribe y el efecto no se retroalimenta con la emisión de `cambio`.
   */
  private podarPorDestinatario(destinatarios: string[]): void {
    this.secuencia.update((actual) => podarSecuencia(actual, destinatarios));

    // El pendiente del selector puede haber dejado de ser elegible: si no se
    // limpia, el `<select>` queda con un value que ya no tiene `<option>`.
    // `untracked` para que el efecto dependa del destinatario y nada más — leer
    // `aAgregar` como dependencia lo haría correr en cada tecla del selector.
    if (destinatarios.length > 0 && !destinatarios.includes(untracked(this.aAgregar))) {
      this.aAgregar.set('');
    }
  }

  private aplicarTurnoExistente(turno: TurnoActividadDto | null): void {
    this.activo.set(turno?.activo ?? false);
    this.modo.set(turno?.modo ?? ModoTurno.ORDEN_FIJO);
    this.frecuencia.set(turno?.frecuencia ?? FrecuenciaTurno.SESION);
    this.secuencia.set(turno?.posiciones.map((posicion) => posicion.usuarioId) ?? []);
  }
}
