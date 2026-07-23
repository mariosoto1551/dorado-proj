import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { type InvitacionDto, EstadoInvitacion, TipoInvitado } from '@dorado/shared-types';
import { ConfirmDialogComponent } from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { mensajeDeError } from '../../core/api/errores';

/** Generar/listar/revocar invitaciones (fase-10). El link se comparte manual (sin email en el MVP). */
@Component({
  selector: 'app-invitaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EncabezadoPaginaComponent, IconoComponent, ConfirmDialogComponent],
  template: `
    <section class="mx-auto max-w-3xl px-4 py-6">
      <app-encabezado-pagina titulo="Invitaciones" subtitulo="Generá un link y compartilo por donde quieras." />

      <div class="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          (click)="generar(TI.USUARIO)"
          [disabled]="generando()"
          class="flex items-center gap-1.5 rounded-lg bg-marca-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
        >
          <span class="h-4 w-4"><app-icono nombre="plus" /></span>
          Invitar usuario
        </button>
        <button
          type="button"
          (click)="generar(TI.TUTOR)"
          [disabled]="generando()"
          class="flex items-center gap-1.5 rounded-lg border border-marca-300 bg-white px-3.5 py-2 text-sm font-semibold text-marca-700 transition hover:bg-marca-50 disabled:opacity-50 dark:border-marca-800 dark:bg-slate-900 dark:text-marca-300 dark:hover:bg-marca-900/30"
        >
          <span class="h-4 w-4"><app-icono nombre="plus" /></span>
          Invitar tutor
        </button>
      </div>

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (pendientes().length === 0) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          No hay invitaciones pendientes.
        </div>
      } @else {
        <ul class="mt-5 space-y-2">
          @for (i of pendientes(); track i.id) {
            <li class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div class="flex items-center justify-between gap-2">
                <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {{ i.tipoInvitado === 'TUTOR' ? 'Tutor' : 'Usuario' }}
                </span>
                <span class="text-xs text-slate-400 dark:text-slate-500">vence {{ fecha(i.expiraEn) }}</span>
              </div>
              <div class="mt-2 flex items-center gap-2">
                <code class="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {{ linkDe(i) }}
                </code>
                <button
                  type="button"
                  (click)="copiar(i)"
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-600 transition hover:bg-marca-100 dark:bg-marca-900/40 dark:text-marca-300 dark:hover:bg-marca-900/60"
                  aria-label="Copiar link"
                  title="Copiar link"
                >
                  <span class="h-4 w-4"><app-icono nombre="copy" /></span>
                </button>
                <button
                  type="button"
                  (click)="aRevocar.set(i)"
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  aria-label="Revocar"
                  title="Revocar"
                >
                  <span class="h-4 w-4"><app-icono nombre="trash" /></span>
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </section>

    <ui-confirm-dialog
      [abierto]="aRevocar() !== null"
      titulo="Revocar invitación"
      mensaje="El link dejará de funcionar. ¿Continuar?"
      textoConfirmar="Revocar"
      (confirmar)="confirmarRevocar()"
      (cancelar)="aRevocar.set(null)"
    />
  `,
})
export class InvitacionesPage {
  readonly grupoId = input.required<string>();

  protected readonly TI = TipoInvitado;

  private readonly api = inject(IdentityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly generando = signal(false);

  protected readonly invitaciones = signal<InvitacionDto[]>([]);

  protected readonly aRevocar = signal<InvitacionDto | null>(null);

  protected readonly pendientes = computed(() =>
    this.invitaciones().filter((i) => i.estado === EstadoInvitacion.PENDIENTE)
  );

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  protected linkDe(i: InvitacionDto): string {
    return `${location.origin}/invitacion/${i.codigo}`;
  }

  protected fecha(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  protected generar(tipo: TipoInvitado): void {
    this.generando.set(true);
    this.api.crearInvitacion(this.grupoId(), { tipoInvitado: tipo }).subscribe({
      next: (inv) => {
        this.toasts.exito('Invitación generada.');
        this.generando.set(false);
        this.cargar(this.grupoId());
        void this.copiarTexto(this.linkDe(inv));
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.generando.set(false);
      },
    });
  }

  protected copiar(i: InvitacionDto): void {
    void this.copiarTexto(this.linkDe(i));
  }

  protected confirmarRevocar(): void {
    const i = this.aRevocar();

    if (!i) {
      return;
    }

    this.api.revocarInvitacion(i.id).subscribe({
      next: () => {
        this.toasts.exito('Invitación revocada.');
        this.aRevocar.set(null);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.aRevocar.set(null);
      },
    });
  }

  private async copiarTexto(texto: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.toasts.info('Link copiado.');
    } catch {
      this.toasts.error('No se pudo copiar; copialo manualmente.');
    }
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);
    this.api.listarInvitaciones(grupoId).subscribe({
      next: (i) => {
        this.invitaciones.set(i);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
