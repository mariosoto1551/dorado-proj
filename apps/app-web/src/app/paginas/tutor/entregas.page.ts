import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, type Observable } from 'rxjs';

import type { PendienteEntregaDto, UsuarioDto } from '@dorado/shared-types';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { mensajeDeError } from '../../core/api/errores';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { RewardsApiService } from '../../core/api/rewards-api.service';
import { CampoComponent, EstadoVacioComponent, ModalComponent } from '@dorado/shared-ui';

/**
 * Pendientes de entrega (fase-14-22). Compras y castigos en UNA sola lista:
 * para el Tutor son la misma tarea física —darle algo a alguien— y separarlas
 * en dos pantallas obligaría a mirar dos lugares todos los días.
 *
 * Es la única acción DIARIA del ítem, por eso tiene entrada propia en el menú
 * en vez de vivir detrás de una pestaña.
 */
@Component({
  selector: 'app-entregas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    EncabezadoPaginaComponent,
    IconoComponent,
    EstadoVacioComponent,
    ModalComponent,
    CampoComponent,
  ],
  template: `
    <section class="mx-auto max-w-3xl px-4 py-6">
      <app-encabezado-pagina
        titulo="Entregas"
        subtitulo="Lo que hay que darle a cada integrante."
      />

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (pendientes().length === 0) {
        <ui-estado-vacio class="mt-6">
          No hay nada pendiente de entregar. 🎉
        </ui-estado-vacio>
      } @else {
        <ul class="mt-5 space-y-2.5">
          @for (p of pendientes(); track p.id) {
            <li
              class="flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900"
              [class]="
                p.origen === 'CASTIGO'
                  ? 'border-red-200 dark:border-red-500/30'
                  : 'border-slate-200 dark:border-slate-800'
              "
            >
              <span
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                [class]="
                  p.origen === 'CASTIGO'
                    ? 'bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-400'
                    : 'bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-400'
                "
              >
                <span class="h-6 w-6">
                  <app-icono [nombre]="p.origen === 'CASTIGO' ? 'flag' : 'gift'" />
                </span>
              </span>

              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold text-slate-900 dark:text-white">
                  {{ p.nombreRecompensaSnapshot }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ nombreDe(p.usuarioId) }} ·
                  {{ p.origen === 'CASTIGO' ? 'castigo' : 'compró por ' + p.monto }}
                </p>
              </div>

              <div class="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  (click)="anular(p)"
                  class="boton boton-neutro boton-sm"
                >
                  {{ p.origen === 'CASTIGO' ? 'Anular' : 'Devolver' }}
                </button>
                <button
                  type="button"
                  (click)="entregar(p)"
                  class="boton boton-primario boton-sm"
                >
                  Entregado
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </section>

    <ui-modal
      [abierto]="anulando() !== null"
      [titulo]="anulando()?.origen === 'CASTIGO' ? 'Anular castigo' : 'Devolver compra'"
      (cerrar)="anulando.set(null)"
    >
      @if (anulando(); as pendiente) {
        <form (submit)="confirmarAnular($event)">
          <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
            @if (pendiente.origen === 'CASTIGO') {
              El castigo no se aplica. <b>Las monedas no cambian</b>: la deuda ya se saldó cuando
              se asignó, y el saldo sigue en 0.
            } @else {
              Se le devuelven las {{ pendiente.monto }} monedas.
            }
          </p>

          <ui-campo
            etiqueta="Motivo"
            [opcional]="pendiente.origen !== 'CASTIGO'"
            class="mt-4"
          >
            <input
              [(ngModel)]="motivo"
              name="motivo"
              maxlength="200"
              [required]="pendiente.origen === 'CASTIGO'"
              class="campo"
            />
          </ui-campo>

          <div class="botonera">
            <button type="button" (click)="anulando.set(null)" class="boton boton-neutro">
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="pendiente.origen === 'CASTIGO' && motivo.trim().length === 0"
              class="boton boton-primario"
            >
              Confirmar
            </button>
          </div>
        </form>
      }
    </ui-modal>
  `,
})
export class EntregasPage {
  readonly grupoId = input.required<string>();

  private readonly api = inject(RewardsApiService);

  private readonly identity = inject(IdentityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly pendientes = signal<PendienteEntregaDto[]>([]);

  protected readonly anulando = signal<PendienteEntregaDto | null>(null);

  private readonly usuarios = signal<UsuarioDto[]>([]);

  protected motivo = '';

  constructor() {
    effect(() => this.cargar(this.grupoId()));
  }

  protected nombreDe(usuarioId: string): string {
    return this.usuarios().find((u) => u.id === usuarioId)?.nombre ?? 'Integrante';
  }

  protected entregar(pendiente: PendienteEntregaDto): void {
    // Los dos endpoints devuelven cosas distintas (CompraDto y void) y acá no
    // se usa el cuerpo: se tipa como unknown para que la unión sea invocable.
    const peticion: Observable<unknown> =
      pendiente.origen === 'COMPRA'
        ? this.api.entregarCompra(pendiente.id)
        : this.api.entregarCastigo(pendiente.id);

    peticion.subscribe({
      next: () => {
        this.toasts.exito('Marcado como entregado.');
        this.cargar(this.grupoId());
      },
      error: (e) => this.toasts.error(mensajeDeError(e)),
    });
  }

  protected anular(pendiente: PendienteEntregaDto): void {
    this.motivo = '';
    this.anulando.set(pendiente);
  }

  protected confirmarAnular(evento: Event): void {
    evento.preventDefault();

    const pendiente = this.anulando();

    if (!pendiente) {
      return;
    }

    const motivo = this.motivo.trim();
    const peticion: Observable<unknown> =
      pendiente.origen === 'CASTIGO'
        ? this.api.anularCastigo(pendiente.id, { motivo })
        : this.api.revertirCompra(pendiente.id, motivo || undefined);

    peticion.subscribe({
      next: () => {
        this.anulando.set(null);
        this.toasts.exito(pendiente.origen === 'CASTIGO' ? 'Castigo anulado.' : 'Compra devuelta.');
        this.cargar(this.grupoId());
      },
      error: (e) => this.toasts.error(mensajeDeError(e)),
    });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);

    forkJoin({
      pendientes: this.api.pendientesDeEntrega(grupoId),
      usuarios: this.identity.listarUsuarios(grupoId),
    }).subscribe({
      next: ({ pendientes, usuarios }) => {
        this.pendientes.set(pendientes);
        this.usuarios.set(usuarios);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
