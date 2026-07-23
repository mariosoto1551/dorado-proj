import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { EvaluarUmbralesEn, ModoSesion } from '@dorado/shared-types';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { ToastService } from '../../componentes/toast.service';
import type { GuardarConfiguracionRequest } from '../../core/api/api.types';
import { mensajeDeError } from '../../core/api/errores';
import { SessionApiService } from '../../core/api/session-api.service';

interface DiaSemana {
  valor: number;
  etiqueta: string;
}

const DIAS: DiaSemana[] = [
  { valor: 1, etiqueta: 'Lun' },
  { valor: 2, etiqueta: 'Mar' },
  { valor: 3, etiqueta: 'Mié' },
  { valor: 4, etiqueta: 'Jue' },
  { valor: 5, etiqueta: 'Vie' },
  { valor: 6, etiqueta: 'Sáb' },
  { valor: 0, etiqueta: 'Dom' },
];

/** Nombres completos para el resumen en lenguaje natural. */
const NOMBRE_DIA: Record<number, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
};

/** Construye "m h * * dows" a partir de una hora HH:mm y días elegidos. */
function armarCron(hora: string, dias: number[]): string {
  const [h, m] = hora.split(':');
  const dow = dias.length === 0 || dias.length === 7 ? '*' : [...dias].sort((a, b) => a - b).join(',');

  return `${Number(m)} ${Number(h)} * * ${dow}`;
}

/** Extrae hora HH:mm y días de un cron de 5 campos (best-effort). */
function parsearCron(cron: string | null): { hora: string; dias: number[] } {
  if (!cron) {
    return { hora: '00:00', dias: [] };
  }

  const partes = cron.trim().split(/\s+/);

  if (partes.length < 5) {
    return { hora: '00:00', dias: [] };
  }

  const min = partes[0].padStart(2, '0');
  const hora = partes[1].padStart(2, '0');
  const dowRaw = partes[4];
  const dias =
    dowRaw === '*'
      ? DIAS.map((d) => d.valor)
      : dowRaw
          .split(',')
          .map((n) => Number(n))
          .filter((n) => !Number.isNaN(n));

  return { hora: `${hora}:${min}`, dias };
}

/** Config de Sesión/Sección (fase-10): modo manual/automático con selector amigable de cron. */
@Component({
  selector: 'app-configuracion-sesion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, EncabezadoPaginaComponent],
  template: `
    <section class="mx-auto max-w-2xl px-4 py-6">
      <app-encabezado-pagina titulo="Configuración de sesión" subtitulo="Cómo se abren y cierran las semanas." />

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else {
        <form (submit)="guardar($event)" class="mt-5 space-y-5">
          <!-- Modo -->
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <span class="text-sm font-bold text-slate-900 dark:text-white">Modo</span>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <label
                class="flex cursor-pointer flex-col rounded-xl border-2 p-3 transition"
                [class]="modo === M.MANUAL ? 'border-marca-500 bg-marca-50 dark:border-marca-500 dark:bg-marca-900/30' : 'border-slate-200 dark:border-slate-700'"
              >
                <input [(ngModel)]="modo" name="modo" type="radio" [value]="M.MANUAL" class="sr-only" />
                <span class="text-sm font-semibold text-slate-800 dark:text-slate-100">Manual</span>
                <span class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Vos abrís y cerrás cada semana.</span>
              </label>
              <label
                class="flex cursor-pointer flex-col rounded-xl border-2 p-3 transition"
                [class]="modo === M.AUTOMATICO ? 'border-marca-500 bg-marca-50 dark:border-marca-500 dark:bg-marca-900/30' : 'border-slate-200 dark:border-slate-700'"
              >
                <input [(ngModel)]="modo" name="modo" type="radio" [value]="M.AUTOMATICO" class="sr-only" />
                <span class="text-sm font-semibold text-slate-800 dark:text-slate-100">Automático</span>
                <span class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Un horario abre/cierra solo.</span>
              </label>
            </div>
          </div>

          @if (modo === M.AUTOMATICO) {
            <!-- Apertura de sesión -->
            <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 animate-fade-in">
              <span class="text-sm font-bold text-slate-900 dark:text-white">Apertura de sesión</span>
              <div class="mt-3">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Días</span>
                <div class="mt-1.5 flex flex-wrap gap-1.5">
                  @for (d of DIAS; track d.valor) {
                    <button
                      type="button"
                      (click)="alternarDia(d.valor)"
                      class="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                      [class]="diasSesion().includes(d.valor) ? 'bg-marca-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'"
                    >
                      {{ d.etiqueta }}
                    </button>
                  }
                </div>
                <p class="mt-1.5 text-xs text-slate-400 dark:text-slate-500">Los días en que se abre una sesión nueva.</p>
              </div>
              <label class="mt-3 block">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Hora</span>
                <input
                  [(ngModel)]="horaSesion"
                  name="horaSesion"
                  type="time"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                />
              </label>
            </div>

            <!-- Cierre de sección -->
            <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 animate-fade-in">
              <span class="text-sm font-bold text-slate-900 dark:text-white">Cierre de sección</span>
              <div class="mt-3">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Días</span>
                <div class="mt-1.5 flex flex-wrap gap-1.5">
                  @for (d of DIAS; track d.valor) {
                    <button
                      type="button"
                      (click)="alternarDiaCierre(d.valor)"
                      class="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                      [class]="diasCierre().includes(d.valor) ? 'bg-marca-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'"
                    >
                      {{ d.etiqueta }}
                    </button>
                  }
                </div>
                <p class="mt-1.5 text-xs text-slate-400 dark:text-slate-500">El día en que el ciclo se cierra y arranca el siguiente.</p>
              </div>
              <label class="mt-3 block">
                <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Hora</span>
                <input
                  [(ngModel)]="horaCierre"
                  name="horaCierre"
                  type="time"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
                />
              </label>
            </div>
          }

          <!-- Comunes -->
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <label class="block">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Sesiones por sección</span>
              <input
                [(ngModel)]="sesionesPorSeccion"
                name="sesionesPorSeccion"
                type="number"
                min="1"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              />
              <span class="mt-1 block text-xs text-slate-400 dark:text-slate-500">
                Cuántas sesiones dura un ciclo antes de pasar a evaluación (el "domingo" de zonas y
                recompensas). En automático suele coincidir con la cantidad de días de apertura.
              </span>
            </label>
            <label class="mt-3 block">
              <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Evaluar zonas</span>
              <select
                [(ngModel)]="evaluarUmbralesEn"
                name="evaluarUmbralesEn"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
              >
                <option [ngValue]="EU.CADA_SESION">En cada sesión</option>
                <option [ngValue]="EU.SOLO_AL_CIERRE_SECCION">Solo al cerrar la sección</option>
              </select>
              <span class="mt-1 block text-xs text-slate-400 dark:text-slate-500">
                «En cada sesión» da feedback continuo; «solo al cerrar» muestra el resultado recién
                al final del ciclo.
              </span>
            </label>
          </div>

          <!-- Resumen en lenguaje natural (se actualiza en vivo) -->
          <div class="rounded-2xl border border-marca-200 bg-marca-50 p-4 dark:border-marca-900/60 dark:bg-marca-900/20">
            <p class="text-xs font-bold text-marca-700 uppercase dark:text-marca-300">En resumen</p>
            <p class="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{{ resumen() }}</p>
          </div>

          <button
            type="submit"
            [disabled]="guardando()"
            class="w-full rounded-lg bg-marca-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
          >
            {{ guardando() ? 'Guardando…' : 'Guardar configuración' }}
          </button>
        </form>
      }
    </section>
  `,
})
export class ConfiguracionSesionPage {
  readonly grupoId = input.required<string>();

  protected readonly M = ModoSesion;

  protected readonly EU = EvaluarUmbralesEn;

  protected readonly DIAS = DIAS;

  private readonly api = inject(SessionApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly guardando = signal(false);

  protected modo: ModoSesion = ModoSesion.MANUAL;

  protected sesionesPorSeccion = 7;

  protected evaluarUmbralesEn: EvaluarUmbralesEn = EvaluarUmbralesEn.SOLO_AL_CIERRE_SECCION;

  protected horaSesion = '00:00';

  protected horaCierre = '23:00';

  protected readonly diasSesion = signal<number[]>([1, 2, 3, 4, 5, 6]);

  protected readonly diasCierre = signal<number[]>([0]);

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  protected alternarDia(dia: number): void {
    this.diasSesion.update((d) => (d.includes(dia) ? d.filter((x) => x !== dia) : [...d, dia]));
  }

  protected alternarDiaCierre(dia: number): void {
    this.diasCierre.update((d) => (d.includes(dia) ? d.filter((x) => x !== dia) : [...d, dia]));
  }

  /**
   * Resumen en lenguaje natural de la configuración, para que el tutor entienda
   * cómo se combinan los tres controles (ritmo de sesión, conteo y cierre) sin
   * tener que razonar la máquina de estados. Se recalcula en cada cambio del
   * form (los eventos de ngModel/los signals de días disparan la detección).
   */
  protected resumen(): string {
    const n = Number(this.sesionesPorSeccion) || 1;
    const plural = n === 1 ? 'sesión' : 'sesiones';
    const evalTxt =
      this.evaluarUmbralesEn === EvaluarUmbralesEn.CADA_SESION
        ? 'Las zonas se recalculan en cada sesión.'
        : 'Las zonas se recalculan solo al cerrar el ciclo.';

    const completar = n === 1 ? 'al completarla' : 'al completarlas';

    if (this.modo === ModoSesion.MANUAL) {
      return `Vos abrís y cerrás cada ciclo a mano. Un ciclo son ${n} ${plural}; ${completar}, el ciclo pasa a evaluación. ${evalTxt}`;
    }

    return (
      `Se abre una sesión ${this.nombreDias(this.diasSesion())} a las ${this.horaSesion}. ` +
      `Un ciclo son ${n} ${plural}: al completarse la ${n}.ª, pasa a evaluación. ` +
      `El ciclo se cierra y reinicia ${this.nombreDias(this.diasCierre())} a las ${this.horaCierre}. ${evalTxt}`
    );
  }

  /** "de lunes a sábado" / "todos los días" / "lunes, miércoles y viernes". */
  private nombreDias(dias: number[]): string {
    if (dias.length === 0) {
      return '(ningún día elegido)';
    }

    if (dias.length === 7) {
      return 'todos los días';
    }

    const ordenados = [...dias].sort((a, b) => this.ordenSemana(a) - this.ordenSemana(b));
    const contiguo = ordenados.every(
      (d, i) => i === 0 || this.ordenSemana(d) === this.ordenSemana(ordenados[i - 1]) + 1
    );

    if (contiguo && ordenados.length >= 3) {
      return `de ${NOMBRE_DIA[ordenados[0]]} a ${NOMBRE_DIA[ordenados[ordenados.length - 1]]}`;
    }

    const nombres = ordenados.map((d) => this.plural(NOMBRE_DIA[d]));

    if (nombres.length === 1) {
      return `los ${nombres[0]}`;
    }

    return `los ${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  }

  /** Pluraliza un día ("domingo" → "domingos"); los que ya terminan en "s" no cambian. */
  private plural(nombre: string): string {
    return nombre.endsWith('s') ? nombre : `${nombre}s`;
  }

  /** Lunes=1 … Sábado=6, Domingo=7 (para ordenar con la semana arrancando en lunes). */
  private ordenSemana(dia: number): number {
    return dia === 0 ? 7 : dia;
  }

  protected guardar(evento: Event): void {
    evento.preventDefault();
    this.guardando.set(true);

    const datos: GuardarConfiguracionRequest = {
      modo: this.modo,
      sesionesPorSeccion: Number(this.sesionesPorSeccion),
      evaluarUmbralesEn: this.evaluarUmbralesEn,
      cronSesion:
        this.modo === ModoSesion.AUTOMATICO ? armarCron(this.horaSesion, this.diasSesion()) : null,
      cronCierreSeccion:
        this.modo === ModoSesion.AUTOMATICO ? armarCron(this.horaCierre, this.diasCierre()) : null,
    };

    this.api.guardarConfiguracion(this.grupoId(), datos).subscribe({
      next: () => {
        this.toasts.exito('Configuración guardada.');
        this.guardando.set(false);
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.guardando.set(false);
      },
    });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);
    this.api.obtenerConfiguracion(grupoId).subscribe({
      next: (c) => {
        this.modo = c.modo;
        this.sesionesPorSeccion = c.sesionesPorSeccion;
        this.evaluarUmbralesEn = c.evaluarUmbralesEn;

        const sesion = parsearCron(c.cronSesion);
        this.horaSesion = sesion.hora;
        this.diasSesion.set(sesion.dias);

        const cierre = parsearCron(c.cronCierreSeccion);
        this.horaCierre = cierre.hora;
        this.diasCierre.set(cierre.dias.length > 0 ? cierre.dias : [0]);

        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
