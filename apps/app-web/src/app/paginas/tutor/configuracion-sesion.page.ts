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
        <p class="mt-8 text-center text-sm text-slate-400">Cargando…</p>
      } @else {
        <form (submit)="guardar($event)" class="mt-5 space-y-5">
          <!-- Modo -->
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span class="text-sm font-bold text-slate-900">Modo</span>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <label
                class="flex cursor-pointer flex-col rounded-xl border-2 p-3 transition"
                [class]="modo === M.MANUAL ? 'border-marca-500 bg-marca-50' : 'border-slate-200'"
              >
                <input [(ngModel)]="modo" name="modo" type="radio" [value]="M.MANUAL" class="sr-only" />
                <span class="text-sm font-semibold text-slate-800">Manual</span>
                <span class="mt-0.5 text-xs text-slate-500">Vos abrís y cerrás cada semana.</span>
              </label>
              <label
                class="flex cursor-pointer flex-col rounded-xl border-2 p-3 transition"
                [class]="modo === M.AUTOMATICO ? 'border-marca-500 bg-marca-50' : 'border-slate-200'"
              >
                <input [(ngModel)]="modo" name="modo" type="radio" [value]="M.AUTOMATICO" class="sr-only" />
                <span class="text-sm font-semibold text-slate-800">Automático</span>
                <span class="mt-0.5 text-xs text-slate-500">Un horario abre/cierra solo.</span>
              </label>
            </div>
          </div>

          @if (modo === M.AUTOMATICO) {
            <!-- Apertura de sesión -->
            <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm animate-fade-in">
              <span class="text-sm font-bold text-slate-900">Apertura de sesión</span>
              <div class="mt-3">
                <span class="text-xs font-semibold text-slate-600">Días</span>
                <div class="mt-1.5 flex flex-wrap gap-1.5">
                  @for (d of DIAS; track d.valor) {
                    <button
                      type="button"
                      (click)="alternarDia(d.valor)"
                      class="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                      [class]="diasSesion().includes(d.valor) ? 'bg-marca-600 text-white' : 'bg-slate-100 text-slate-600'"
                    >
                      {{ d.etiqueta }}
                    </button>
                  }
                </div>
              </div>
              <label class="mt-3 block">
                <span class="text-xs font-semibold text-slate-600">Hora</span>
                <input
                  [(ngModel)]="horaSesion"
                  name="horaSesion"
                  type="time"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
                />
              </label>
            </div>

            <!-- Cierre de sección -->
            <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm animate-fade-in">
              <span class="text-sm font-bold text-slate-900">Cierre de sección</span>
              <div class="mt-3">
                <span class="text-xs font-semibold text-slate-600">Días</span>
                <div class="mt-1.5 flex flex-wrap gap-1.5">
                  @for (d of DIAS; track d.valor) {
                    <button
                      type="button"
                      (click)="alternarDiaCierre(d.valor)"
                      class="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                      [class]="diasCierre().includes(d.valor) ? 'bg-marca-600 text-white' : 'bg-slate-100 text-slate-600'"
                    >
                      {{ d.etiqueta }}
                    </button>
                  }
                </div>
              </div>
              <label class="mt-3 block">
                <span class="text-xs font-semibold text-slate-600">Hora</span>
                <input
                  [(ngModel)]="horaCierre"
                  name="horaCierre"
                  type="time"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
                />
              </label>
            </div>
          }

          <!-- Comunes -->
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label class="block">
              <span class="text-xs font-semibold text-slate-600">Sesiones por sección</span>
              <input
                [(ngModel)]="sesionesPorSeccion"
                name="sesionesPorSeccion"
                type="number"
                min="1"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
              />
            </label>
            <label class="mt-3 block">
              <span class="text-xs font-semibold text-slate-600">Evaluar zonas</span>
              <select
                [(ngModel)]="evaluarUmbralesEn"
                name="evaluarUmbralesEn"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
              >
                <option [ngValue]="EU.CADA_SESION">En cada sesión</option>
                <option [ngValue]="EU.SOLO_AL_CIERRE_SECCION">Solo al cerrar la sección</option>
              </select>
            </label>
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
