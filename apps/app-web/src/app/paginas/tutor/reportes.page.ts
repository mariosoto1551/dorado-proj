import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { forkJoin } from 'rxjs';

import type { ConductaDto, ReporteMiembroDto, UsuarioDto } from '@dorado/shared-types';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { mensajeDeError } from '../../core/api/errores';

/** Bandeja de reportes del jefe de equipo (fase-14-09): aprobar / rechazar. */
@Component({
  selector: 'app-reportes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EncabezadoPaginaComponent],
  template: `
    <section class="mx-auto max-w-2xl px-4 py-6">
      <app-encabezado-pagina
        titulo="Reportes"
        subtitulo="Cuando un jefe reporta a un integrante, revisá y aplicá (o rechazá) el descuento."
      />

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else {
        <h2 class="mt-6 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Pendientes ({{ pendientes().length }})
        </h2>
        @if (pendientes().length === 0) {
          <div class="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            No hay reportes pendientes.
          </div>
        } @else {
          <ul class="mt-3 space-y-3">
            @for (r of pendientes(); track r.id) {
              <li class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div class="flex items-start gap-3">
                  <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg dark:bg-slate-800">🙂</span>
                  <div class="min-w-0 flex-1">
                    <p class="font-bold text-slate-900 dark:text-white">{{ nombreUsuario(r.reportadoUsuarioId) }}</p>
                    <p class="text-xs text-slate-400 dark:text-slate-500">Reportó {{ nombreUsuario(r.jefeUsuarioId) }} (jefe)</p>
                  </div>
                  <span class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">Pendiente</span>
                </div>
                <div class="mt-3 flex items-center gap-2">
                  <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">Conducta</span>
                  <span class="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{{ nombreConducta(r.conductaId) }}</span>
                  <span class="text-sm font-bold text-red-500 tabular-nums dark:text-red-400">−{{ puntosConducta(r.conductaId) }}</span>
                </div>
                @if (r.motivo) {
                  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">“{{ r.motivo }}”</p>
                }
                <div class="mt-3 flex gap-2">
                  <button type="button" (click)="aprobar(r)" [disabled]="procesando()" class="flex-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20">✓ Aprobar</button>
                  <button type="button" (click)="rechazar(r)" [disabled]="procesando()" class="flex-1 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20">Rechazar</button>
                </div>
              </li>
            }
          </ul>
        }

        @if (resueltos().length > 0) {
          <h2 class="mt-8 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Resueltos</h2>
          <ul class="mt-3 space-y-2">
            @for (r of resueltos(); track r.id) {
              <li class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{{ nombreUsuario(r.reportadoUsuarioId) }}</p>
                  <p class="text-xs text-slate-400 dark:text-slate-500">{{ nombreConducta(r.conductaId) }}</p>
                </div>
                @if (r.estado === 'APROBADO') {
                  <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">✓ Aprobado</span>
                } @else {
                  <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">Rechazado</span>
                }
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
})
export class ReportesPage {
  readonly grupoId = input.required<string>();

  private readonly activity = inject(ActivityApiService);

  private readonly identity = inject(IdentityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly procesando = signal(false);

  protected readonly reportes = signal<ReporteMiembroDto[]>([]);

  private readonly usuarios = signal<UsuarioDto[]>([]);

  private readonly conductas = signal<ConductaDto[]>([]);

  protected readonly pendientes = computed(() =>
    this.reportes().filter((r) => r.estado === 'PENDIENTE')
  );

  protected readonly resueltos = computed(() =>
    this.reportes().filter((r) => r.estado !== 'PENDIENTE')
  );

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  protected nombreUsuario(usuarioId: string): string {
    return this.usuarios().find((u) => u.id === usuarioId)?.nombre ?? 'Participante';
  }

  protected nombreConducta(conductaId: string): string {
    return this.conductas().find((c) => c.id === conductaId)?.nombre ?? 'Conducta';
  }

  protected puntosConducta(conductaId: string): number {
    return this.conductas().find((c) => c.id === conductaId)?.valorPuntos ?? 0;
  }

  protected aprobar(r: ReporteMiembroDto): void {
    this.procesando.set(true);
    this.activity.aprobarReporte(r.id).subscribe({
      next: () => {
        this.toasts.exito('Reporte aprobado — se aplicó el descuento.');
        this.procesando.set(false);
        this.cargar(this.grupoId(), false);
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  protected rechazar(r: ReporteMiembroDto): void {
    this.procesando.set(true);
    this.activity.rechazarReporte(r.id).subscribe({
      next: () => {
        this.toasts.exito('Reporte rechazado.');
        this.procesando.set(false);
        this.cargar(this.grupoId(), false);
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  private cargar(grupoId: string, mostrarSpinner = true): void {
    if (mostrarSpinner) {
      this.cargando.set(true);
    }

    forkJoin({
      reportes: this.activity.listarReportes(grupoId),
      usuarios: this.identity.listarUsuarios(grupoId),
      conductas: this.activity.listarConductas(grupoId),
    }).subscribe({
      next: ({ reportes, usuarios, conductas }) => {
        this.reportes.set(reportes);
        this.usuarios.set(usuarios);
        this.conductas.set(conductas);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
