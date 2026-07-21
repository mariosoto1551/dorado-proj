import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { UsuarioDto } from '@dorado/shared-types';
import { ConfirmDialogComponent } from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { mensajeDeError } from '../../core/api/errores';

/** Lista de usuarios del grupo (fase-10): editar nombre/avatarId, desactivar. */
@Component({
  selector: 'app-usuarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, EncabezadoPaginaComponent, IconoComponent, ConfirmDialogComponent],
  template: `
    <section class="mx-auto max-w-3xl px-4 py-6">
      <app-encabezado-pagina titulo="Usuarios" subtitulo="Quiénes participan en este grupo." />

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400">Cargando…</p>
      } @else if (usuarios().length === 0) {
        <div class="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Todavía no hay usuarios. Generá una invitación en «Invitaciones».
        </div>
      } @else {
        <ul class="mt-5 space-y-2">
          @for (u of usuarios(); track u.id) {
            <li class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca-100 text-sm font-bold text-marca-700">
                {{ iniciales(u.nombre) }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold text-slate-900">{{ u.nombre }}</p>
                <p class="text-xs text-slate-400">&#64;{{ u.username }}</p>
              </div>
              @if (u.estado === 'INACTIVO') {
                <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">Inactivo</span>
              }
              <div class="flex shrink-0 gap-1">
                <button
                  type="button"
                  (click)="abrirEditar(u)"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-marca-600"
                  aria-label="Editar"
                >
                  <span class="h-4 w-4"><app-icono nombre="pencil" /></span>
                </button>
                @if (u.estado === 'ACTIVO') {
                  <button
                    type="button"
                    (click)="aDesactivar.set(u)"
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    aria-label="Desactivar"
                  >
                    <span class="h-4 w-4"><app-icono nombre="trash" /></span>
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>

    @if (editando(); as u) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <button
          type="button"
          aria-label="Cerrar"
          (click)="editando.set(null)"
          class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"
        ></button>
        <form
          (submit)="guardar($event)"
          class="relative w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up sm:rounded-2xl"
        >
          <h2 class="text-lg font-bold text-slate-900">Editar usuario</h2>
          <label class="mt-4 block">
            <span class="text-xs font-semibold text-slate-600">Nombre</span>
            <input
              [(ngModel)]="nombreEdit"
              name="nombre"
              required
              maxlength="120"
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none"
            />
          </label>
          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              (click)="editando.set(null)"
              class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="guardando()"
              class="rounded-lg bg-marca-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    }

    <ui-confirm-dialog
      [abierto]="aDesactivar() !== null"
      titulo="Desactivar usuario"
      [mensaje]="'¿Desactivar a ' + (aDesactivar()?.nombre ?? '') + '? No podrá seguir participando.'"
      textoConfirmar="Desactivar"
      (confirmar)="confirmarDesactivar()"
      (cancelar)="aDesactivar.set(null)"
    />
  `,
})
export class UsuariosPage {
  readonly grupoId = input.required<string>();

  private readonly api = inject(IdentityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly usuarios = signal<UsuarioDto[]>([]);

  protected readonly editando = signal<UsuarioDto | null>(null);

  protected readonly guardando = signal(false);

  protected readonly aDesactivar = signal<UsuarioDto | null>(null);

  protected nombreEdit = '';

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  protected iniciales(nombre: string): string {
    return nombre
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  protected abrirEditar(u: UsuarioDto): void {
    this.nombreEdit = u.nombre;
    this.editando.set(u);
  }

  protected guardar(evento: Event): void {
    evento.preventDefault();
    const u = this.editando();

    if (!u || this.nombreEdit.trim().length === 0) {
      return;
    }

    this.guardando.set(true);
    this.api.editarUsuario(u.id, { nombre: this.nombreEdit.trim() }).subscribe({
      next: () => {
        this.toasts.exito('Usuario actualizado.');
        this.guardando.set(false);
        this.editando.set(null);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.guardando.set(false);
      },
    });
  }

  protected confirmarDesactivar(): void {
    const u = this.aDesactivar();

    if (!u) {
      return;
    }

    this.api.desactivarUsuario(u.id).subscribe({
      next: () => {
        this.toasts.exito('Usuario desactivado.');
        this.aDesactivar.set(null);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.aDesactivar.set(null);
      },
    });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);
    this.api.listarUsuarios(grupoId).subscribe({
      next: (u) => {
        this.usuarios.set(u);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
