import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';

import {
  AlcanceActividad,
  TipoConducta,
  type ActividadDto,
  type ConductaDto,
  type EquipoMiembroDto,
  type MiEquipoDto,
} from '@dorado/shared-types';

import { ToastService } from '../../componentes/toast.service';
import { ActivityApiService } from '../../core/api/activity-api.service';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { ScoringApiService } from '../../core/api/scoring-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { mensajeDeError } from '../../core/api/errores';

/** Vista "Mi equipo" del participante (fase-14-09). El jefe completa la tarea y reporta. */
@Component({
  selector: 'app-mi-equipo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="mx-auto max-w-xl px-4 py-6">
      <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Mi equipo</h1>

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (!equipo()) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Todavía no estás en un equipo en este grupo.
        </div>
      } @else {
        <!-- Puntaje del equipo -->
        <div class="mt-4 rounded-3xl border border-slate-200 bg-gradient-to-br from-amber-50 to-teal-50 p-5 text-center dark:border-slate-800 dark:from-amber-500/10 dark:to-teal-500/10">
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{{ equipo()!.nombre }}</p>
          <p class="mt-1 text-4xl font-extrabold tracking-tight text-slate-900 tabular-nums dark:text-white">
            {{ puntaje() ?? '·' }} <span class="text-lg font-bold text-slate-500 dark:text-slate-400">pts</span>
          </p>
          @if (esJefe()) {
            <span class="mt-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">★ Sos el jefe</span>
          }
        </div>

        <!-- Tareas de equipo -->
        <h2 class="mt-6 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Tareas de equipo</h2>
        @if (tareas().length === 0) {
          <p class="mt-2 rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            No hay tareas de equipo activas.
          </p>
        } @else {
          <ul class="mt-2 space-y-2">
            @for (t of tareas(); track t.id) {
              <li class="rounded-2xl border border-slate-200 border-l-4 border-l-amber-400 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div class="flex items-start gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold text-slate-900 dark:text-white">{{ t.nombre }}</p>
                    <p class="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      +{{ t.valorPuntos }} c/u@if (esJefe() && t.bonoJefePuntos > 0) { · vos +{{ t.bonoJefePuntos }} de bono }
                    </p>
                  </div>
                  <span class="rounded-lg bg-amber-100 px-2 py-1 text-sm font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    +{{ t.valorPuntos + (esJefe() ? t.bonoJefePuntos : 0) }}
                  </span>
                </div>
                @if (esJefe()) {
                  <button type="button" (click)="completar(t)" [disabled]="procesando()" class="mt-3 w-full rounded-lg bg-marca-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50">Marcar como hecha</button>
                } @else {
                  <p class="mt-2 text-xs font-medium text-slate-400 dark:text-slate-500">La marca el jefe del equipo.</p>
                }
              </li>
            }
          </ul>
        }

        <!-- Integrantes -->
        <h2 class="mt-6 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Integrantes</h2>
        <ul class="mt-2 space-y-2">
          @for (m of equipo()!.miembros; track m.usuarioId) {
            <li class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
                [class]="m.rol === 'JEFE' ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-slate-100 dark:bg-slate-800'">
                {{ m.rol === 'JEFE' ? '👑' : '🙂' }}
              </span>
              <span class="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">
                {{ m.nombre }}
                @if (m.usuarioId === miId()) { <span class="text-xs text-slate-400 dark:text-slate-500">(vos)</span> }
              </span>
              @if (m.rol === 'JEFE') {
                <span class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">Jefe</span>
              } @else if (esJefe() && m.usuarioId !== miId()) {
                <button type="button" (click)="abrirReporte(m)" class="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20">Reportar</button>
              }
            </li>
          }
        </ul>
      }
    </section>

    <!-- Modal reportar -->
    @if (reportando(); as m) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <button type="button" aria-label="Cerrar" (click)="reportando.set(null)" class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"></button>
        <form (submit)="enviarReporte($event)" class="relative w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up dark:bg-slate-900 sm:rounded-2xl">
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">Reportar a {{ m.nombre }}</h2>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">El tutor revisa y decide si se aplica el descuento.</p>
          <label class="mt-4 block">
            <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Conducta</span>
            <select [(ngModel)]="conductaId" name="conducta" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40 dark:text-white">
              <option value="" disabled>Elegí una conducta…</option>
              @for (c of conductasMalas(); track c.id) {
                <option [value]="c.id">{{ c.nombre }} (−{{ c.valorPuntos }})</option>
              }
            </select>
          </label>
          @if (conductasMalas().length === 0) {
            <p class="mt-2 text-xs text-amber-600 dark:text-amber-400">No hay conductas "malas" configuradas en el grupo. Pedile al tutor que cree una.</p>
          }
          <label class="mt-4 block">
            <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Nota (opcional)</span>
            <textarea [(ngModel)]="motivo" name="motivo" rows="2" maxlength="500" placeholder="¿Qué pasó?" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"></textarea>
          </label>
          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" (click)="reportando.set(null)" class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancelar</button>
            <button type="submit" [disabled]="procesando() || conductaId === ''" class="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">Enviar reporte</button>
          </div>
        </form>
      </div>
    }
  `,
})
export class MiEquipoPage {
  private readonly auth = inject(AuthService);

  private readonly identity = inject(IdentityApiService);

  private readonly activity = inject(ActivityApiService);

  private readonly scoring = inject(ScoringApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly procesando = signal(false);

  protected readonly equipo = signal<MiEquipoDto | null>(null);

  protected readonly puntaje = signal<number | null>(null);

  protected readonly tareas = signal<ActividadDto[]>([]);

  private readonly conductas = signal<ConductaDto[]>([]);

  protected readonly reportando = signal<EquipoMiembroDto | null>(null);

  protected conductaId = '';

  protected motivo = '';

  protected readonly miId = computed(() => this.auth.principalId());

  protected readonly esJefe = computed(() => this.equipo()?.esJefe ?? false);

  protected readonly conductasMalas = computed(() =>
    this.conductas().filter((c) => c.tipo === TipoConducta.MALA && c.estado === 'ACTIVA')
  );

  constructor() {
    effect(() => {
      const grupo = this.auth.grupoUsuario();
      this.cargar(grupo);
    });
  }

  protected completar(t: ActividadDto): void {
    const e = this.equipo();

    if (!e) {
      return;
    }

    this.procesando.set(true);
    this.activity.completarTareaEquipo(e.id, t.id).subscribe({
      next: () => {
        this.toasts.exito('¡Tarea completada! Se repartieron los puntos.');
        this.procesando.set(false);
        this.refrescarPuntaje(e.id);
      },
      error: (err) => {
        this.toasts.error(mensajeDeError(err));
        this.procesando.set(false);
      },
    });
  }

  protected abrirReporte(m: EquipoMiembroDto): void {
    this.conductaId = '';
    this.motivo = '';
    this.reportando.set(m);
  }

  protected enviarReporte(evento: Event): void {
    evento.preventDefault();
    const e = this.equipo();
    const m = this.reportando();

    if (!e || !m || this.conductaId === '') {
      return;
    }

    this.procesando.set(true);
    this.activity
      .crearReporte(e.id, {
        reportadoUsuarioId: m.usuarioId,
        conductaId: this.conductaId,
        motivo: this.motivo.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.toasts.exito('Reporte enviado al tutor.');
          this.procesando.set(false);
          this.reportando.set(null);
        },
        error: (err) => {
          this.toasts.error(mensajeDeError(err));
          this.procesando.set(false);
        },
      });
  }

  private cargar(grupoId: string | null): void {
    this.cargando.set(true);
    this.equipo.set(null);
    this.puntaje.set(null);
    this.tareas.set([]);

    if (!grupoId) {
      this.cargando.set(false);

      return;
    }

    this.identity.misEquipos().subscribe({
      next: (equipos) => {
        const equipo = equipos.find((e) => e.grupoId === grupoId) ?? null;
        this.equipo.set(equipo);

        if (!equipo) {
          this.cargando.set(false);

          return;
        }

        this.refrescarPuntaje(equipo.id);

        forkJoin({
          actividades: this.activity.listarActividades(grupoId, 'ACTIVA'),
          conductas: equipo.esJefe ? this.activity.listarConductas(grupoId, 'ACTIVA') : of([]),
        }).subscribe({
          next: ({ actividades, conductas }) => {
            this.tareas.set(actividades.filter((a) => a.alcance === AlcanceActividad.EQUIPO));
            this.conductas.set(conductas);
            this.cargando.set(false);
          },
          error: () => this.cargando.set(false),
        });
      },
      error: () => this.cargando.set(false),
    });
  }

  private refrescarPuntaje(equipoId: string): void {
    this.scoring.puntajeDeEquipo(equipoId).subscribe({
      next: (p) => this.puntaje.set(p.puntajeTotal),
      error: () => undefined,
    });
  }
}
