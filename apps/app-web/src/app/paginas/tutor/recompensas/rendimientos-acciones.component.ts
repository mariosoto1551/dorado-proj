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

import type { RendimientoAccionDto, RendimientoZonaDto } from '@dorado/shared-types';
import { AlcanceActividad } from '@dorado/shared-types';

import { EntradaAsistenteComponent } from '../../../componentes/entrada-asistente.component';
import { ToastService } from '../../../componentes/toast.service';
import { mensajeDeError } from '../../../core/api/errores';
import { RewardsApiService } from '../../../core/api/rewards-api.service';
import { SessionApiService } from '../../../core/api/session-api.service';
import { calcularCalibracion } from '../../../core/calibracion-monedas';

/** Clave de `valores`: la misma clave compuesta que usa el backend. */
function clave(fila: RendimientoAccionDto): string {
  return `${fila.tipoAccion}:${fila.origenId}`;
}

/**
 * La SEGUNDA fuente de la economía (fase-14-28 Parte F, lado del Tutor): cuánto
 * paga cada acción del catálogo.
 *
 * Pantalla propia y no un campo en el formulario de la actividad (decisión 10):
 * calibrar una economía es mirar todos los números juntos, no entrar de a uno —
 * y guardar todo en una llamada elimina el guardado parcial que tendría un
 * formulario que escribe en dos servicios.
 */
@Component({
  selector: 'app-rendimientos-acciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, EntradaAsistenteComponent],
  template: `
    <div class="tarjeta">
      <p class="text-sm font-bold text-slate-900 dark:text-white">
        Cuánto paga cada cosa que hacen
      </p>
      <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        Se acredita al instante, no al cerrar la semana. Es independiente de los puntos: una
        actividad puede dar 0 puntos y pagar monedas, o al revés.
      </p>

      @if (cargando()) {
        <p class="mt-6 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (vacio()) {
        <p class="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
          Este grupo todavía no tiene actividades ni conductas buenas cargadas.
        </p>
      } @else {
        @if (actividades().length > 0) {
          <p class="mt-5 text-xs font-bold tracking-wide text-slate-400 uppercase dark:text-slate-500">
            Actividades
          </p>
          <ul class="mt-2 space-y-1.5">
            @for (fila of actividades(); track fila.origenId) {
              <li class="rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800">
                <div class="flex items-center gap-3">
                  <span class="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {{ fila.nombre }}
                  </span>
                  <span class="shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">
                    +{{ fila.valorPuntos }} pts
                  </span>
                  @if (fila.puedeRendir) {
                    <input
                      type="number"
                      min="0"
                      [(ngModel)]="valores[claveDe(fila)]"
                      (ngModelChange)="recalcular()"
                      [name]="'acc-' + fila.origenId"
                      [attr.aria-label]="'Monedas por ' + fila.nombre"
                      class="w-20 shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                    />
                    <span class="shrink-0 text-sm">{{ icono() }}</span>
                  } @else {
                    <span class="shrink-0 text-xs text-slate-300 dark:text-slate-600">—</span>
                  }
                </div>

                <!-- Decisión 8: el bono del jefe es un número propio, no un
                     porcentaje del de arriba. Solo existe en las de equipo. -->
                @if (fila.puedeRendir && fila.alcance === EQUIPO) {
                  <div class="mt-1.5 flex items-center gap-3 pl-4">
                    <span class="flex-1 text-xs text-slate-500 dark:text-slate-400">
                      ↳ bono del jefe
                    </span>
                    <span class="shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">
                      +{{ fila.bonoJefePuntos ?? 0 }} pts
                    </span>
                    <input
                      type="number"
                      min="0"
                      [(ngModel)]="bonos[claveDe(fila)]"
                      (ngModelChange)="recalcular()"
                      [name]="'bono-' + fila.origenId"
                      [attr.aria-label]="'Bono del jefe en monedas por ' + fila.nombre"
                      class="w-20 shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                    />
                    <span class="shrink-0 text-sm">{{ icono() }}</span>
                  </div>
                }

                <!-- Decisión 15: se muestra deshabilitada y DICE POR QUÉ. Un
                     campo ausente sin explicación es la peor versión. -->
                @if (!fila.puedeRendir) {
                  <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {{ fila.motivoNoRinde }}
                  </p>
                }
              </li>
            }
          </ul>
        }

        @if (conductas().length > 0) {
          <p class="mt-5 text-xs font-bold tracking-wide text-slate-400 uppercase dark:text-slate-500">
            Conductas buenas
          </p>
          <ul class="mt-2 space-y-1.5">
            @for (fila of conductas(); track fila.origenId) {
              <li class="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800">
                <span class="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {{ fila.nombre }}
                </span>
                <span class="shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">
                  +{{ fila.valorPuntos }} pts
                </span>
                <input
                  type="number"
                  min="0"
                  [(ngModel)]="valores[claveDe(fila)]"
                  (ngModelChange)="recalcular()"
                  [name]="'con-' + fila.origenId"
                  [attr.aria-label]="'Monedas por ' + fila.nombre"
                  class="w-20 shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                />
                <span class="shrink-0 text-sm">{{ icono() }}</span>
              </li>
            }
          </ul>
        }

        <!-- Decisión 18: el aviso va del otro lado que el de fase-14-22 —
             cuánto rinde AHORA una semana completa. Es el único número que el
             Tutor no puede calcular solo, y el que le dice si acaba de
             devaluar la tienda entera. No bloquea nada. -->
        <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Una semana cumpliendo todo rinde
            <b class="text-slate-700 tabular-nums dark:text-slate-200">
              ≈ {{ calibracion().porAcciones }} {{ icono() }}
            </b>
            , contra
            <b class="text-slate-700 tabular-nums dark:text-slate-200">
              ≈ {{ calibracion().porZona }} {{ icono() }}
            </b>
            por zona.
          </p>
          <button
            type="button"
            (click)="guardar()"
            [disabled]="guardando()"
            class="boton boton-primario"
          >
            {{ guardando() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>

        <!--
          fase-14-29: la otra entrada de contexto al asistente. El aviso de
          arriba dice cuánto rinde una semana; no dice cuánto DEBERÍA rendir, y
          esa es justo la pregunta que nadie sabe contestar al llegar acá.
        -->
        <app-entrada-asistente
          class="mt-3 block"
          variante="enlace"
          [grupoId]="grupoId()"
          [pregunta]="PREGUNTA_CALIBRAR"
          titulo="¿Cuánto debería pagar cada cosa? Preguntale a la IA"
        />
      }
    </div>
  `,
})
export class RendimientosAccionesComponent {
  readonly grupoId = input.required<string>();

  /** fase-14-29: la pregunta que el aviso de calibración no puede contestar. */
  protected readonly PREGUNTA_CALIBRAR =
    'Mirá lo que paga hoy cada acción, los precios de la tienda y las zonas del ' +
    'grupo, y decime si la economía está calibrada. Si no, proponeme los cambios.';

  /** El ícono de moneda del Grupo — nunca se hardcodea (misma regla que zonas). */
  readonly icono = input<string>('🪙');

  protected readonly EQUIPO = AlcanceActividad.EQUIPO;

  private readonly api = inject(RewardsApiService);

  private readonly session = inject(SessionApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly guardando = signal(false);

  protected readonly actividades = signal<RendimientoAccionDto[]>([]);

  protected readonly conductas = signal<RendimientoAccionDto[]>([]);

  protected readonly vacio = computed(
    () => this.actividades().length === 0 && this.conductas().length === 0
  );

  protected readonly calibracion = signal({ porAcciones: 0, porZona: 0 });

  protected valores: Record<string, number> = {};

  protected bonos: Record<string, number> = {};

  /** Cuántas sesiones tiene la Sección: el multiplicador de «una semana». */
  private sesionesPorSeccion = 1;

  private zonas: RendimientoZonaDto[] = [];

  constructor() {
    effect(() => this.cargar(this.grupoId()));
  }

  protected claveDe(fila: RendimientoAccionDto): string {
    return clave(fila);
  }

  /**
   * Un solo `Guardar` para todo (decisión 10). Viajan TODAS las filas que
   * pueden rendir, no solo las tocadas: el `PUT` es idempotente y mandar el
   * estado completo evita que un 0 escrito a mano se lea como «no lo mandé».
   */
  protected guardar(): void {
    this.guardando.set(true);

    const rendimientos = [...this.actividades(), ...this.conductas()]
      .filter((fila) => fila.puedeRendir)
      .map((fila) => ({
        tipoAccion: fila.tipoAccion,
        origenId: fila.origenId,
        monedas: Number(this.valores[clave(fila)] ?? 0),
        monedasBonoJefe: Number(this.bonos[clave(fila)] ?? 0),
      }));

    if (rendimientos.length === 0) {
      this.guardando.set(false);

      return;
    }

    this.api.configurarRendimientosAcciones(this.grupoId(), { rendimientos }).subscribe({
      next: (actualizados) => {
        this.aplicar(actualizados.actividades, actualizados.conductas);
        this.guardando.set(false);
        this.toasts.exito('Rendimiento por actividad guardado.');
      },
      error: (e) => {
        this.guardando.set(false);
        this.toasts.error(mensajeDeError(e));
      },
    });
  }

  protected recalcular(): void {
    // Se recalcula contra lo TIPEADO, no contra lo guardado: el punto del aviso
    // es ver el efecto antes de apretar Guardar.
    const conValoresActuales = (filas: RendimientoAccionDto[]): RendimientoAccionDto[] =>
      filas.map((fila) => ({
        ...fila,
        monedas: Number(this.valores[clave(fila)] ?? 0),
        monedasBonoJefe: Number(this.bonos[clave(fila)] ?? 0),
      }));

    this.calibracion.set(
      calcularCalibracion(
        conValoresActuales(this.actividades()),
        conValoresActuales(this.conductas()),
        this.sesionesPorSeccion,
        this.zonas
      )
    );
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);

    this.api.rendimientosAcciones(grupoId).subscribe({
      next: (datos) => {
        this.aplicar(datos.actividades, datos.conductas);
        this.cargando.set(false);
      },
      error: (e) => {
        this.cargando.set(false);
        this.toasts.error(mensajeDeError(e));
      },
    });

    // Los dos datos del aviso. Fallan en silencio a propósito: sin ellos el
    // número queda conservador, pero la pantalla sigue sirviendo para lo suyo.
    this.api.rendimientos(grupoId).subscribe({
      next: (zonas) => {
        this.zonas = zonas;
        this.recalcular();
      },
      error: () => undefined,
    });

    this.session.obtenerConfiguracion(grupoId).subscribe({
      next: (config) => {
        this.sesionesPorSeccion = config.sesionesPorSeccion;
        this.recalcular();
      },
      error: () => undefined,
    });
  }

  private aplicar(
    actividades: RendimientoAccionDto[],
    conductas: RendimientoAccionDto[]
  ): void {
    this.actividades.set(actividades);
    this.conductas.set(conductas);

    for (const fila of [...actividades, ...conductas]) {
      this.valores[clave(fila)] = fila.monedas;
      this.bonos[clave(fila)] = fila.monedasBonoJefe;
    }

    this.recalcular();
  }
}
