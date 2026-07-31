import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { RolGrupoDto } from '@dorado/shared-types';
import { ConfirmDialogComponent } from '@dorado/shared-ui';

import { EncabezadoPaginaComponent } from '../../componentes/encabezado-pagina.component';
import { ToastService } from '../../componentes/toast.service';
import { IdentityApiService } from '../../core/api/identity-api.service';
import { mensajeDeError } from '../../core/api/errores';

/**
 * Paleta del selector de color de un rol. Son colores de ETIQUETA, no de zona:
 * los de zona se leen de la API (`UmbralZona.colorHex`) y no se tocan desde acá.
 */
const COLORES = [
  '#22C55E',
  '#3B82F6',
  '#A855F7',
  '#EC4899',
  '#F59E0B',
  '#EF4444',
  '#14B8A6',
  '#64748B',
];

/** Roles del participante dentro del Grupo (fase-14-19): catálogo del Tutor. */
@Component({
  selector: 'app-roles-grupo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, EncabezadoPaginaComponent, ConfirmDialogComponent],
  template: `
    <section class="mx-auto max-w-3xl px-4 py-6">
      <app-encabezado-pagina
        titulo="Roles"
        subtitulo="Etiquetas del grupo (cocina, mascotas…) para que cada uno vea solo lo suyo."
      />

      @if (cargando()) {
        <p class="mt-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else {
        <button
          type="button"
          (click)="abrirCrear()"
          class="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-marca-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-marca-700"
        >
          ＋ Nuevo rol
        </button>

        @if (activos().length === 0) {
          <div class="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Todavía no hay roles en este grupo. Sin roles, todas las actividades
            las ven todos los integrantes — que es como funciona hoy.
          </div>
        } @else {
          <ul class="mt-4 space-y-2">
            @for (rol of activos(); track rol.id) {
              <li class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <span
                  class="h-8 w-8 shrink-0 rounded-full"
                  [style.background-color]="rol.colorHex"
                  aria-hidden="true"
                ></span>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold text-slate-900 dark:text-white">{{ rol.nombre }}</p>
                  <p class="text-xs text-slate-400 dark:text-slate-500">
                    {{ rol.cantidadAsignados ?? 0 }}
                    integrante{{ (rol.cantidadAsignados ?? 0) === 1 ? '' : 's' }}
                  </p>
                </div>
                <div class="flex shrink-0 gap-2">
                  <button
                    type="button"
                    (click)="abrirEditar(rol)"
                    class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    (click)="aArchivar.set(rol)"
                    class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-500/10"
                  >
                    Archivar
                  </button>
                </div>
              </li>
            }
          </ul>
        }

        <p class="mt-4 text-xs text-slate-400 dark:text-slate-500">
          El rol se asigna a cada integrante desde «Usuarios», y se usa al crear
          una actividad para limitar quién la ve.
        </p>
      }
    </section>

    <!-- Alta / edición -->
    @if (editor(); as modo) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <button
          type="button"
          aria-label="Cerrar"
          (click)="cerrarEditor()"
          class="absolute inset-0 cursor-default bg-slate-900/50 animate-fade-in"
        ></button>
        <form
          (submit)="guardar($event)"
          class="relative w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl animate-slide-up dark:bg-slate-900 sm:rounded-2xl"
        >
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">
            {{ modo === 'crear' ? 'Nuevo rol' : 'Editar rol' }}
          </h2>

          <label class="mt-4 block">
            <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Nombre</span>
            <input
              [(ngModel)]="nombre"
              name="nombre"
              required
              maxlength="30"
              placeholder="Cocina"
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca-500 focus:ring-2 focus:ring-marca-200 focus:outline-none dark:border-slate-700 dark:bg-slate-950/40 dark:text-white"
            />
          </label>

          <span class="mt-4 block text-xs font-semibold text-slate-600 dark:text-slate-300">Color</span>
          <div class="mt-2 flex flex-wrap gap-2">
            @for (color of colores; track color) {
              <button
                type="button"
                (click)="colorHex.set(color)"
                [attr.aria-label]="'Color ' + color"
                [attr.aria-pressed]="colorHex() === color"
                class="h-9 w-9 rounded-full transition"
                [class]="colorHex() === color ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900' : ''"
                [style.background-color]="color"
              ></button>
            }
          </div>

          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              (click)="cerrarEditor()"
              class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="guardando() || nombre.trim().length === 0"
              class="rounded-lg bg-marca-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    }

    <ui-confirm-dialog
      [abierto]="aArchivar() !== null"
      titulo="Archivar rol"
      [mensaje]="mensajeArchivar()"
      textoConfirmar="Archivar"
      (confirmar)="confirmarArchivar()"
      (cancelar)="aArchivar.set(null)"
    />
  `,
})
export class RolesGrupoPage {
  readonly grupoId = input.required<string>();

  private readonly api = inject(IdentityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly colores = COLORES;

  protected readonly cargando = signal(true);

  protected readonly activos = signal<RolGrupoDto[]>([]);

  protected readonly guardando = signal(false);

  /** null = cerrado; 'crear' o el rol que se está editando. */
  protected readonly editor = signal<'crear' | 'editar' | null>(null);

  protected readonly aArchivar = signal<RolGrupoDto | null>(null);

  protected nombre = '';

  protected readonly colorHex = signal(COLORES[0]);

  private readonly editando = signal<RolGrupoDto | null>(null);

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  /**
   * El aviso dice a cuántos desasigna: archivar un rol no es solo esconderlo,
   * les saca la etiqueta a sus integrantes y esconde las actividades que lo
   * pedían (decisión 12 de la spec).
   */
  protected mensajeArchivar(): string {
    const rol = this.aArchivar();

    if (!rol) {
      return '';
    }

    const asignados = rol.cantidadAsignados ?? 0;

    if (asignados === 0) {
      return `¿Archivar «${rol.nombre}»? No lo tiene ningún integrante.`;
    }

    return `¿Archivar «${rol.nombre}»? Se lo va a quitar a ${asignados} integrante${
      asignados === 1 ? '' : 's'
    }, y las actividades que pidan ese rol dejarán de verse.`;
  }

  protected abrirCrear(): void {
    this.nombre = '';
    this.colorHex.set(COLORES[0]);
    this.editando.set(null);
    this.editor.set('crear');
  }

  protected abrirEditar(rol: RolGrupoDto): void {
    this.nombre = rol.nombre;
    this.colorHex.set(rol.colorHex);
    this.editando.set(rol);
    this.editor.set('editar');
  }

  protected cerrarEditor(): void {
    this.editor.set(null);
    this.editando.set(null);
  }

  protected guardar(evento: Event): void {
    evento.preventDefault();

    const nombre = this.nombre.trim();

    if (nombre.length === 0) {
      return;
    }

    this.guardando.set(true);

    const rol = this.editando();
    const peticion = rol
      ? this.api.actualizarRolGrupo(rol.id, { nombre, colorHex: this.colorHex() })
      : this.api.crearRolGrupo(this.grupoId(), { nombre, colorHex: this.colorHex() });

    peticion.subscribe({
      next: () => {
        this.toasts.exito(rol ? 'Rol actualizado.' : 'Rol creado.');
        this.guardando.set(false);
        this.cerrarEditor();
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.guardando.set(false);
      },
    });
  }

  protected confirmarArchivar(): void {
    const rol = this.aArchivar();

    if (!rol) {
      return;
    }

    this.api.actualizarRolGrupo(rol.id, { estado: 'INACTIVO' }).subscribe({
      next: () => {
        this.toasts.exito('Rol archivado.');
        this.aArchivar.set(null);
        this.cargar(this.grupoId());
      },
      error: (e) => {
        this.toasts.error(mensajeDeError(e));
        this.aArchivar.set(null);
      },
    });
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);
    this.api.listarRolesGrupo(grupoId).subscribe({
      next: (roles) => {
        this.activos.set(roles);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
