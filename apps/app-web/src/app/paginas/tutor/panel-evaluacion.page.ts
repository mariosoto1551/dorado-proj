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

import type {
  CanjeRecompensaDto,
  PuntajeUsuarioDto,
  RecompensaDto,
  UsuarioDto,
} from '@dorado/shared-types';
import { ConfirmDialogComponent, ZonaBadgeComponent } from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { ToastService } from '../../componentes/toast.service';
import { mensajeDeError } from '../../core/api/errores';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { RewardsApiService } from '../../core/api/rewards-api.service';
import { ScoringApiService } from '../../core/api/scoring-api.service';

interface FilaRanking extends PuntajeUsuarioDto {
  nombre: string;
  posicion: number;
}

/** Panel de evaluación ("domingo", fase-10): ranking final, descalificar, repartir recompensas. */
@Component({
  selector: 'app-panel-evaluacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EncabezadoPaginaComponent, ZonaBadgeComponent, ConfirmDialogComponent],
  template: `
    <section class="mx-auto max-w-3xl px-4 py-6">
      <app-encabezado-pagina titulo="Evaluación de la sección" subtitulo="Revisá zonas y repartí recompensas." />

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else {
        <!-- Ranking final -->
        <div class="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 class="border-b border-slate-100 px-4 py-3 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white">Ranking final</h2>
          @if (ranking().length === 0) {
            <p class="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Sin participantes.</p>
          } @else {
            <ul class="divide-y divide-slate-50 dark:divide-slate-800">
              @for (fila of ranking(); track fila.usuarioId) {
                <li class="flex items-center gap-3 px-4 py-3" [class.opacity-50]="fila.descalificado">
                  <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    [class]="fila.posicion <= 3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'"
                  >
                    {{ fila.posicion }}
                  </span>
                  <span class="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">{{ fila.nombre }}</span>
                  <ui-zona-badge [zona]="fila.zona" tamano="sm" />
                  <span class="w-12 text-right text-sm font-bold text-slate-900 dark:text-white">{{ fila.puntajeTotal }}</span>
                  @if (fila.descalificado) {
                    <span class="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-400">Descal.</span>
                  } @else {
                    <button
                      type="button"
                      (click)="aDescalificar.set(fila)"
                      class="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      Descalificar
                    </button>
                  }
                </li>
              }
            </ul>
          }
        </div>

        <!-- Canjes -->
        <div class="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 class="border-b border-slate-100 px-4 py-3 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white">Recompensas a entregar</h2>
          @if (canjes().length === 0) {
            <p class="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Nadie eligió recompensa todavía.</p>
          } @else {
            <ul class="divide-y divide-slate-50 dark:divide-slate-800">
              @for (c of canjes(); track c.id) {
                <li class="flex items-center gap-3 px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-medium text-slate-800 dark:text-slate-100">{{ nombreUsuario(c.usuarioId) }}</p>
                    <p class="truncate text-xs text-slate-500 dark:text-slate-400">
                      {{ nombreRecompensa(c.recompensaId) }} · {{ c.mecanica === 'AZAR' ? 'azar' : 'elección' }}
                    </p>
                  </div>
                  @if (c.estado === 'ENTREGADA') {
                    <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      Entregada
                    </span>
                  } @else {
                    <button
                      type="button"
                      (click)="entregar(c)"
                      [disabled]="procesando()"
                      class="rounded-lg bg-marca-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
                    >
                      Marcar entregada
                    </button>
                  }
                </li>
              }
            </ul>
          }
        </div>
      }
    </section>

    <ui-confirm-dialog
      [abierto]="aDescalificar() !== null"
      titulo="Descalificar usuario"
      [mensaje]="'Descalificar a ' + (aDescalificar()?.nombre ?? '') + '. Indicá el motivo:'"
      textoConfirmar="Descalificar"
      [requiereMotivo]="true"
      placeholderMotivo="Motivo de la descalificación…"
      (confirmar)="confirmarDescalificar($event)"
      (cancelar)="aDescalificar.set(null)"
    />
  `,
})
export class PanelEvaluacionPage {
  readonly grupoId = input.required<string>();

  readonly seccionId = input.required<string>();

  private readonly scoring = inject(ScoringApiService);

  private readonly rewards = inject(RewardsApiService);

  private readonly identity = inject(IdentityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly procesando = signal(false);

  private readonly puntajes = signal<PuntajeUsuarioDto[]>([]);

  private readonly usuarios = signal<UsuarioDto[]>([]);

  private readonly recompensas = signal<RecompensaDto[]>([]);

  protected readonly canjes = signal<CanjeRecompensaDto[]>([]);

  protected readonly aDescalificar = signal<FilaRanking | null>(null);

  protected readonly ranking = computed<FilaRanking[]>(() => {
    const mapa = new Map(this.usuarios().map((u) => [u.id, u.nombre]));

    return [...this.puntajes()]
      .sort((a, b) => b.puntajeTotal - a.puntajeTotal)
      .map((p, i) => ({ ...p, nombre: mapa.get(p.usuarioId) ?? 'Usuario', posicion: i + 1 }));
  });

  constructor() {
    effect(() => {
      const g = this.grupoId();
      const s = this.seccionId();
      this.cargar(g, s);
    });
  }

  protected nombreUsuario(id: string): string {
    return this.usuarios().find((u) => u.id === id)?.nombre ?? 'Usuario';
  }

  protected nombreRecompensa(id: string): string {
    return this.recompensas().find((r) => r.id === id)?.nombre ?? 'Recompensa';
  }

  protected confirmarDescalificar(motivo: string): void {
    const fila = this.aDescalificar();

    if (!fila || motivo.trim().length === 0) {
      return;
    }

    this.procesando.set(true);
    this.scoring.descalificar(this.seccionId(), fila.usuarioId, { motivo: motivo.trim() }).subscribe({
      next: () => {
        this.toasts.exito('Usuario descalificado.');
        this.aDescalificar.set(null);
        this.procesando.set(false);
        this.cargar(this.grupoId(), this.seccionId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  protected entregar(c: CanjeRecompensaDto): void {
    this.procesando.set(true);
    this.rewards.marcarEntregada(c.id).subscribe({
      next: (actualizado) => {
        this.canjes.update((lista) => lista.map((x) => (x.id === c.id ? actualizado : x)));
        this.procesando.set(false);
        this.toasts.exito('Recompensa marcada como entregada.');
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  private cargar(grupoId: string, seccionId: string): void {
    this.cargando.set(true);
    forkJoin({
      puntajes: this.scoring.puntajesDeGrupo(grupoId, seccionId),
      usuarios: this.identity.listarUsuarios(grupoId),
      recompensas: this.rewards.listarRecompensas(grupoId),
      canjes: this.rewards.listarCanjes(grupoId, seccionId),
    }).subscribe({
      next: ({ puntajes, usuarios, recompensas, canjes }) => {
        this.puntajes.set(puntajes);
        this.usuarios.set(usuarios);
        this.recompensas.set(recompensas);
        this.canjes.set(canjes);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
