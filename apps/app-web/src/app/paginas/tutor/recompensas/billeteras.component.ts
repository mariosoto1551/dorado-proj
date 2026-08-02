import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import type { BilleteraDto, UsuarioDto } from '@dorado/shared-types';

import { ToastService } from '../../../componentes/toast.service';
import { mensajeDeError } from '../../../core/api/errores';
import { IdentityApiService } from '../../../core/api/identity-api.service';
import { RewardsApiService } from '../../../core/api/rewards-api.service';
import { EstadoVacioComponent, CampoComponent, ModalComponent } from '@dorado/shared-ui';

/**
 * Saldo de cada integrante + ajuste manual (fase-14-22). El ajuste exige
 * motivo y **no puede dejar el saldo en negativo**: la única deuda que el
 * sistema permite es la del cierre, y esa se salda sola.
 */
@Component({
  selector: 'app-billeteras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, CampoComponent, EstadoVacioComponent, FormsModule],
  template: `
    <p class="text-sm text-slate-500 dark:text-slate-400">
      Cuánto tiene cada integrante y ajustes a mano.
    </p>

    @if (cargando()) {
      <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
    } @else if (billeteras().length === 0) {
      <ui-estado-vacio class="mt-5">
        Todavía no hay integrantes en el grupo.
      </ui-estado-vacio>
    } @else {
      <ul class="mt-5 space-y-2">
        @for (b of billeteras(); track b.usuarioId) {
          <li class="flex items-center gap-3 tarjeta">
            <span class="flex-1 truncate font-semibold text-slate-900 dark:text-white">
              {{ nombreDe(b.usuarioId) }}
            </span>
            <span class="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              {{ b.iconoMoneda }} {{ b.saldo }}
            </span>
            <button
              type="button"
              (click)="abrirAjuste(b)"
              class="boton boton-neutro boton-sm"
            >
              Ajustar
            </button>
          </li>
        }
      </ul>
    }

    <ui-modal
      [abierto]="ajustando() !== null"
      [titulo]="'Ajustar a ' + nombreDe(ajustando()?.usuarioId ?? '')"
      (cerrar)="ajustando.set(null)"
    >
      @if (ajustando(); as billetera) {
        <form (submit)="guardarAjuste($event)">
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tiene {{ billetera.saldo }} {{ billetera.nombreMoneda }}. Un ajuste negativo no puede
            dejarlo por debajo de 0.
          </p>

          <div class="mt-4 space-y-3">
            <ui-campo etiqueta="Monto (negativo para descontar)">
              <input
                type="number"
                [(ngModel)]="monto"
                name="monto"
                class="w-32 campo"
              />
            </ui-campo>
            <ui-campo etiqueta="Motivo">
              <input
                [(ngModel)]="motivo"
                name="motivo"
                required
                maxlength="200"
                placeholder="Ej: ayudó con la mudanza"
                class="campo"
              />
            </ui-campo>
          </div>

          <div class="botonera">
            <button type="button" (click)="ajustando.set(null)" class="boton boton-neutro">
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="guardando() || motivo.trim().length === 0 || monto === 0"
              class="boton boton-primario"
            >
              {{ guardando() ? 'Guardando…' : 'Ajustar' }}
            </button>
          </div>
        </form>
      }
    </ui-modal>
  `,
})
export class BilleterasComponent {
  readonly grupoId = input.required<string>();

  private readonly api = inject(RewardsApiService);

  private readonly identity = inject(IdentityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly guardando = signal(false);

  protected readonly billeteras = signal<BilleteraDto[]>([]);

  protected readonly ajustando = signal<BilleteraDto | null>(null);

  private readonly usuarios = signal<UsuarioDto[]>([]);

  protected monto = 0;

  protected motivo = '';

  constructor() {
    effect(() => this.cargar(this.grupoId()));
  }

  protected nombreDe(usuarioId: string): string {
    return this.usuarios().find((u) => u.id === usuarioId)?.nombre ?? 'Integrante';
  }

  protected abrirAjuste(billetera: BilleteraDto): void {
    this.ajustando.set(billetera);
    this.monto = 0;
    this.motivo = '';
  }

  protected guardarAjuste(evento: Event): void {
    evento.preventDefault();

    const billetera = this.ajustando();

    if (!billetera || this.motivo.trim().length === 0 || Number(this.monto) === 0) {
      return;
    }

    this.guardando.set(true);

    this.api
      .ajustarMonedas(this.grupoId(), billetera.usuarioId, {
        monto: Number(this.monto),
        motivo: this.motivo.trim(),
      })
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.ajustando.set(null);
          this.toasts.exito('Ajuste aplicado.');
          this.cargar(this.grupoId());
        },
        error: (e) => {
          this.guardando.set(false);
          this.toasts.error(mensajeDeError(e));
        },
      });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);

    forkJoin({
      billeteras: this.api.billeteras(grupoId),
      usuarios: this.identity.listarUsuarios(grupoId),
    }).subscribe({
      next: ({ billeteras, usuarios }) => {
        this.billeteras.set(billeteras);
        this.usuarios.set(usuarios);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
