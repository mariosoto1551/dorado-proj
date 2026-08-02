import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { RolGrupoDto, UsuarioDto } from '@dorado/shared-types';
import {
  CampoComponent,
  ConfirmDialogComponent,
  EstadoVacioComponent,
  ModalComponent,
} from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { IconoComponent } from '../../componentes/icono.component';
import { ToastService } from '../../componentes/toast.service';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { mensajeDeError } from '../../core/api/errores';

/** Lista de usuarios del grupo (fase-10): editar nombre/avatarId, desactivar. */
@Component({
  selector: 'app-usuarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    EncabezadoPaginaComponent,
    IconoComponent,
    ConfirmDialogComponent,
    EstadoVacioComponent,
    ModalComponent,
    CampoComponent,
  ],
  template: `
    <section class="mx-auto max-w-3xl px-4 py-6">
      <app-encabezado-pagina titulo="Usuarios" subtitulo="Quiénes participan en este grupo." />

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else if (usuarios().length === 0) {
        <ui-estado-vacio class="mt-6">
          Todavía no hay usuarios. Generá una invitación en «Invitaciones».
        </ui-estado-vacio>
      } @else {
        <ul class="mt-5 space-y-2">
          @for (u of usuarios(); track u.id) {
            <li class="flex items-center gap-3 tarjeta">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca-100 text-sm font-bold text-marca-700 dark:bg-marca-900/40 dark:text-marca-300">
                {{ iniciales(u.nombre) }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold text-slate-900 dark:text-white">{{ u.nombre }}</p>
                <p class="text-xs text-slate-400 dark:text-slate-500">&#64;{{ u.username }}</p>
                <!-- fase-14-19: el rol se fija acá mismo, sin abrir nada -->
                @if (roles().length > 0) {
                  <select
                    [ngModel]="u.rolGrupo?.id ?? ''"
                    (ngModelChange)="cambiarRol(u, $event)"
                    [name]="'rol-' + u.id"
                    [disabled]="asignando() === u.id"
                    [style.border-color]="u.rolGrupo?.colorHex"
                    class="mt-1.5 w-full max-w-44 boton boton-neutro boton-sm"
                  >
                    <option value="">Sin rol</option>
                    @for (rol of roles(); track rol.id) {
                      <option [value]="rol.id">{{ rol.nombre }}</option>
                    }
                  </select>
                }
              </div>
              @if (u.estado === 'INACTIVO') {
                <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">Inactivo</span>
              }
              <div class="flex shrink-0 gap-1">
                <button
                  type="button"
                  (click)="abrirEditar(u)"
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-marca-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-marca-300"
                  aria-label="Editar"
                >
                  <span class="h-4 w-4"><app-icono nombre="pencil" /></span>
                </button>
                @if (u.estado === 'ACTIVO') {
                  <button
                    type="button"
                    (click)="aDesactivar.set(u)"
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
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

    <ui-modal
      [abierto]="editando() !== null"
      titulo="Editar usuario"
      ancho="sm"
      (cerrar)="editando.set(null)"
    >
      @if (editando() !== null) {
        <form (submit)="guardar($event)">
          <ui-campo etiqueta="Nombre" class="mt-4">
            <input
              [(ngModel)]="nombreEdit"
              name="nombre"
              required
              maxlength="120"
              class="campo"
            />
          </ui-campo>
          <div class="botonera">
            <button type="button" (click)="editando.set(null)" class="boton boton-neutro">
              Cancelar
            </button>
            <button type="submit" [disabled]="guardando()" class="boton boton-primario">
              Guardar
            </button>
          </div>
        </form>
      }
    </ui-modal>

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

  /** fase-14-19: catálogo de roles ACTIVO del grupo; vacío = no se ofrece nada. */
  protected readonly roles = signal<RolGrupoDto[]>([]);

  /** id del participante cuyo rol se está guardando (deshabilita su selector). */
  protected readonly asignando = signal<string | null>(null);

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  /**
   * Asigna, cambia o quita el rol (fase-14-19). Un cambio = un PUT idempotente;
   * la lista se refresca con la respuesta del servidor y no de forma optimista,
   * porque el rol decide qué actividades ve el integrante y una pantalla que
   * miente sobre eso es peor que una que tarda medio segundo.
   */
  protected cambiarRol(usuario: UsuarioDto, rolGrupoId: string): void {
    this.asignando.set(usuario.id);
    this.api
      .asignarRolGrupo(this.grupoId(), usuario.id, { rolGrupoId: rolGrupoId || null })
      .subscribe({
        next: () => {
          this.asignando.set(null);
          this.cargar(this.grupoId());
        },
        error: (e) => {
          this.toasts.error(mensajeDeError(e));
          this.asignando.set(null);
          this.cargar(this.grupoId());
        },
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

    // Los roles van aparte y no bloquean la lista: si el grupo no usa roles, la
    // pantalla queda exactamente como antes del ítem 19.
    this.api.listarRolesGrupo(grupoId).subscribe({
      next: (roles) => this.roles.set(roles),
      error: () => this.roles.set([]),
    });
  }
}
