import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import type { CanjeRecompensaDto, RecompensaDto } from '@dorado/shared-types';

import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import type { ElegiblesResponse, MotivoSinElegibles } from '../../core/api/api.types';
import { mensajeDeError } from '../../core/api/errores';
import { RewardsApiService } from '../../core/api/rewards-api.service';
import { SessionApiService } from '../../core/api/session-api.service';
import { AuthService } from '../../core/auth/auth.service';

const MOTIVOS: Record<MotivoSinElegibles, string> = {
  SECCION_NO_EVALUADA: 'Las recompensas se habilitan cuando la semana termina y se evalúa. ⏳',
  DESCALIFICADO: 'Esta semana quedaste descalificado, así que no hay recompensa. 😕',
  SIN_ZONA: 'Todavía no alcanzaste una zona con recompensas. ¡Seguí sumando! 💪',
};

/** Elegir/sortear recompensa (fase-10). Solo si la sección está evaluada y no descalificado. */
@Component({
  selector: 'app-mis-recompensas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    <section class="mx-auto max-w-xl px-4 py-5">
      <h1 class="text-xl font-bold tracking-tight text-slate-900">Mis recompensas</h1>

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400">Cargando…</p>
      } @else if (canje(); as c) {
        <!-- Ya canjeó -->
        <div class="mt-6 rounded-3xl bg-linear-to-br from-amber-400 to-amber-600 p-6 text-center text-white shadow-lg animate-pop">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
            <span class="h-8 w-8"><app-icono nombre="trophy" /></span>
          </div>
          <p class="mt-3 text-sm text-amber-50">¡Tu recompensa!</p>
          <p class="text-2xl font-black">{{ nombreCanje() }}</p>
          <p class="mt-2 text-sm text-amber-50">
            {{ c.estado === 'ENTREGADA' ? '✅ Ya te la entregaron' : '⏳ Pendiente de entrega' }}
          </p>
        </div>
      } @else if (motivo()) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {{ MOTIVOS[motivo()!] }}
        </div>
      } @else {
        <p class="mt-1 text-sm text-slate-500">¡Alcanzaste una zona con premios! Elegí uno. 🎁</p>

        @if (elegibles()?.disponiblesSeleccion?.length) {
          <h2 class="mt-6 mb-2 text-sm font-bold text-slate-500 uppercase">Elegí uno</h2>
          <ul class="space-y-2.5">
            @for (r of elegibles()!.disponiblesSeleccion; track r.id) {
              <li class="flex items-center gap-3 rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-sm">
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
                  <span class="h-6 w-6"><app-icono nombre="gift" /></span>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-slate-900">{{ r.nombre }}</p>
                  @if (r.descripcion) {
                    <p class="text-xs text-slate-500">{{ r.descripcion }}</p>
                  }
                </div>
                <button
                  type="button"
                  (click)="seleccionar(r)"
                  [disabled]="procesando()"
                  class="shrink-0 rounded-full bg-marca-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
                >
                  Elegir
                </button>
              </li>
            }
          </ul>
        }

        @if (elegibles()?.disponiblesAzar?.length) {
          <div class="mt-6 rounded-3xl border-2 border-dashed border-marca-200 bg-marca-50 p-5 text-center">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-marca-100 text-marca-600">
              <span class="h-7 w-7"><app-icono nombre="dice" /></span>
            </div>
            <p class="mt-2 text-sm font-medium text-slate-600">
              ¿Preferís la sorpresa? Hay {{ elegibles()!.disponiblesAzar.length }} premios al azar.
            </p>
            <button
              type="button"
              (click)="sortear()"
              [disabled]="procesando()"
              class="mt-3 rounded-full bg-marca-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-marca-700 disabled:opacity-50"
            >
              🎲 Sortear
            </button>
          </div>
        }
      }
    </section>
  `,
})
export class MisRecompensasPage {
  private readonly auth = inject(AuthService);

  private readonly session = inject(SessionApiService);

  private readonly rewards = inject(RewardsApiService);

  private readonly toasts = inject(ToastService);

  protected readonly MOTIVOS = MOTIVOS;

  protected readonly cargando = signal(true);

  protected readonly procesando = signal(false);

  protected readonly elegibles = signal<ElegiblesResponse | null>(null);

  protected readonly canje = signal<CanjeRecompensaDto | null>(null);

  private seccionId: string | null = null;

  private usuarioId: string | null = null;

  protected readonly motivo = computed(() => this.elegibles()?.motivo ?? null);

  constructor() {
    this.cargar();
  }

  protected nombreCanje(): string {
    const c = this.canje();

    if (!c) {
      return '';
    }

    const todas = [
      ...(this.elegibles()?.disponiblesSeleccion ?? []),
      ...(this.elegibles()?.disponiblesAzar ?? []),
    ];

    return todas.find((r) => r.id === c.recompensaId)?.nombre ?? '¡Sorpresa!';
  }

  protected seleccionar(r: RecompensaDto): void {
    if (!this.seccionId || !this.usuarioId) {
      return;
    }

    this.procesando.set(true);
    this.rewards.seleccionar(this.usuarioId, this.seccionId, { recompensaId: r.id }).subscribe({
      next: (c) => {
        this.canje.set(c);
        this.procesando.set(false);
        this.toasts.exito('¡Elegiste tu recompensa! 🎉');
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  protected sortear(): void {
    if (!this.seccionId || !this.usuarioId) {
      return;
    }

    this.procesando.set(true);
    this.rewards.sortear(this.usuarioId, this.seccionId).subscribe({
      next: (c) => {
        this.canje.set(c);
        this.procesando.set(false);
        this.toasts.exito('¡La suerte habló! 🎲');
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.procesando.set(false);
      },
    });
  }

  private cargar(): void {
    const grupoId = this.auth.grupoUsuario();
    const usuarioId = this.auth.principalId();

    if (!grupoId || !usuarioId) {
      this.cargando.set(false);

      return;
    }

    this.session.seccionActual(grupoId).subscribe({
      next: (seccion) => {
        if (!seccion) {
          this.cargando.set(false);

          return;
        }

        this.seccionId = seccion.id;
        this.usuarioId = usuarioId;
        this.rewards.elegibles(usuarioId, seccion.id).subscribe({
          next: (e) => {
            this.elegibles.set(e);
            this.cargando.set(false);
          },
          error: () => this.cargando.set(false),
        });
      },
      error: () => this.cargando.set(false),
    });
  }
}
