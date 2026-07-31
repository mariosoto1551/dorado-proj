import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
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

import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import { mensajeDeError } from '../../core/api/errores';
import { resumenDeReparto } from '../../core/turnos';

/**
 * Armador de la secuencia de turnos de una obligatoria (fase-14-21).
 *
 * Lo que hay que tener presente al leerlo: la secuencia es una **lista ordenada
 * de posiciones**, no un conjunto de participantes. Agregar dos veces a José es
 * lo esperado —le va a tocar el doble— y por eso el selector nunca lo saca de
 * las opciones disponibles.
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
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Orden</span>
              <select
                [(ngModel)]="modo"
                name="modoTurno"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              >
                <option value="ORDEN_FIJO">Tal como lo armo</option>
                <option value="AZAR">Al azar, sin repetir</option>
              </select>
            </label>
            <label class="flex-1">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Rota</span>
              <select
                [(ngModel)]="frecuencia"
                name="frecuenciaTurno"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              >
                <option value="SESION">Cada día</option>
                <option value="SECCION">Cada semana</option>
              </select>
            </label>
          </div>

          <!-- La secuencia: lista ordenada, con repetidos permitidos -->
          <span class="mt-4 block text-xs font-semibold text-slate-600 dark:text-slate-300">
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
              [(ngModel)]="aAgregar"
              name="agregarTurno"
              class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
            >
              <option value="">Elegir integrante…</option>
              @for (usuario of usuarios(); track usuario.id) {
                <option [value]="usuario.id">{{ usuario.nombre }}</option>
              }
            </select>
            <button
              type="button"
              (click)="agregar()"
              [disabled]="aAgregar === ''"
              class="shrink-0 rounded-lg bg-marca-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
            >
              ＋ Agregar
            </button>
          </div>

          <!-- Atajos que PRECARGAN la lista y la dejan editable (decisión 4) -->
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              (click)="precargarTodos()"
              class="rounded-full border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              todo el grupo
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

          <button
            type="button"
            (click)="guardar()"
            [disabled]="guardando() || secuencia().length === 0"
            class="mt-3 w-full rounded-lg bg-marca-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
          >
            Guardar turnos
          </button>
          <p class="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Los cambios entran en la vuelta siguiente: a quien ya tiene el turno
            asignado esta vuelta no se le cambia el día.
          </p>
        </div>
      }
    </div>
  `,
})
export class TurnosActividadComponent {
  readonly actividadId = input.required<string>();

  readonly usuarios = input.required<UsuarioDto[]>();

  readonly roles = input<RolGrupoDto[]>([]);

  /** Configuración ya guardada; null = la actividad todavía no rota. */
  readonly turno = input<TurnoActividadDto | null>(null);

  readonly guardado = output<TurnoActividadDto | null>();

  private readonly api = inject(ActivityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly guardando = signal(false);

  protected readonly activo = signal(false);

  protected readonly secuencia = signal<string[]>([]);

  protected modo: ModoTurno = ModoTurno.ORDEN_FIJO;

  protected frecuencia: FrecuenciaTurno = FrecuenciaTurno.SESION;

  protected aAgregar = '';

  /** «José: 2 de cada 4 días» — la vista previa del reparto que se armó. */
  protected readonly resumen = computed(() =>
    resumenDeReparto(this.secuencia(), (id) => this.nombreDe(id))
  );

  constructor() {
    // El input llega después del primer render (la config se pide aparte).
    queueMicrotask(() => this.aplicarTurnoExistente());
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

  protected alternarActivo(): void {
    const nuevo = !this.activo();

    this.activo.set(nuevo);

    if (!nuevo && this.turno()) {
      this.apagar();
    }
  }

  protected agregar(): void {
    if (this.aAgregar === '') {
      return;
    }

    // Sin quitarlo de las opciones: repetir a alguien es justamente el punto.
    this.secuencia.update((actual) => [...actual, this.aAgregar]);
    this.aAgregar = '';
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
    this.secuencia.set(this.usuarios().map((usuario) => usuario.id));
  }

  protected precargarPorRol(rolGrupoId: string): void {
    this.secuencia.set(
      this.usuarios()
        .filter((usuario) => usuario.rolGrupo?.id === rolGrupoId)
        .map((usuario) => usuario.id)
    );
  }

  protected guardar(): void {
    this.guardando.set(true);
    this.api
      .configurarTurno(this.actividadId(), {
        modo: this.modo,
        frecuencia: this.frecuencia,
        activo: true,
        posiciones: this.secuencia().map((usuarioId) => ({ usuarioId })),
      })
      .subscribe({
        next: (turno) => {
          this.toasts.exito('Turnos guardados.');
          this.guardando.set(false);
          this.guardado.emit(turno);
        },
        error: (e) => {
          this.toasts.error(mensajeDeError(e));
          this.guardando.set(false);
        },
      });
  }

  private apagar(): void {
    this.api.apagarTurno(this.actividadId()).subscribe({
      next: () => {
        this.toasts.exito('La actividad vuelve a ser de todos.');
        this.guardado.emit(null);
      },
      error: (e) => this.toasts.error(mensajeDeError(e)),
    });
  }

  private aplicarTurnoExistente(): void {
    const turno = this.turno();

    if (!turno) {
      return;
    }

    this.activo.set(turno.activo);
    this.modo = turno.modo;
    this.frecuencia = turno.frecuencia;
    this.secuencia.set(turno.posiciones.map((posicion) => posicion.usuarioId));
  }
}
