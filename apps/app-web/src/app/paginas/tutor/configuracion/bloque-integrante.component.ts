import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  ModoCreacionContenidoUsuario,
  type ConfiguracionContenidoGrupoDto,
  type RolGrupoDto,
} from '@dorado/shared-types';
import { CampoComponent } from '@dorado/shared-ui';

import { ToastService } from '../../../componentes/toast.service';
import { ActivityApiService } from '../../../core/api/activity-api.service';
import { IdentityApiService } from '../../../core/api/identity-api.service';
import { mensajeDeError } from '../../../core/api/errores';

/** Las 3 opciones del ítem 10, con el texto que ve el tutor. */
const OPCIONES_MODO: ReadonlyArray<{
  modo: ModoCreacionContenidoUsuario;
  titulo: string;
  descripcion: string;
}> = [
  {
    modo: ModoCreacionContenidoUsuario.RESTRICTIVO,
    titulo: 'Restrictivo',
    descripcion: 'Solo vos creás actividades. Es el comportamiento de siempre.',
  },
  {
    modo: ModoCreacionContenidoUsuario.BAJO_APROBACION,
    titulo: 'Bajo aprobación',
    descripcion: 'Los integrantes proponen y vos aprobás o rechazás antes de que valga puntos.',
  },
  {
    modo: ModoCreacionContenidoUsuario.LIBRE,
    titulo: 'Libre',
    descripcion: 'Cada integrante crea sus propias actividades y quedan activas al instante.',
  },
];

/**
 * «Qué ve el integrante» — tercer bloque del hub (fase-14-23 T3).
 *
 * Junta los dos interruptores que hasta ahora vivían apilados arriba del
 * catálogo en `/actividades` —plan del día (#17) y contenido de los integrantes
 * (#10)— y el estado de los Roles (#19), que sigue siendo pantalla propia
 * porque es un CRUD con modal (decisión 1 de la tanda).
 */
@Component({
  selector: 'app-bloque-integrante',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, CampoComponent],
  template: `
    <section>
      @if (cargando()) {
        <p class="py-8 text-center text-sm text-slate-400 dark:text-slate-500">Cargando…</p>
      } @else {
        <!-- Plan del día (fase-14-17) -->
        <label class="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            [checked]="planDelDiaActivo()"
            [disabled]="guardandoPlan()"
            (change)="alternarPlanDelDia(!planDelDiaActivo())"
            class="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-marca-600 focus:ring-marca-200 disabled:opacity-50 dark:border-slate-600"
          />
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-slate-900 dark:text-white">
              Plan del día
            </span>
            <span class="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              Las opcionales dejan de aparecer en la lista del integrante hasta que él las elige
              (cada día arranca de cero). Las obligatorias, las de equipo y las que marques
              «siempre a la vista» se ven igual.
            </span>
          </span>
        </label>

        <!-- Contenido creado por los integrantes (fase-14-10) -->
        <div class="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <span class="text-sm font-semibold text-slate-900 dark:text-white">
            Contenido de los integrantes
          </span>

          <div class="mt-2 space-y-2">
            @for (opcion of OPCIONES_MODO; track opcion.modo) {
              <label
                class="flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition"
                [class]="
                  modoElegido() === opcion.modo
                    ? 'border-marca-500 bg-marca-50 dark:border-marca-400 dark:bg-marca-900/20'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60'
                "
              >
                <input
                  type="radio"
                  name="modoContenido"
                  [value]="opcion.modo"
                  [checked]="modoElegido() === opcion.modo"
                  (change)="modoElegido.set(opcion.modo)"
                  class="mt-0.5 h-4 w-4 shrink-0 border-slate-300 text-marca-600 focus:ring-marca-200 dark:border-slate-600"
                />
                <span class="min-w-0">
                  <span class="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {{ opcion.titulo }}
                  </span>
                  <span class="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {{ opcion.descripcion }}
                  </span>
                </span>
              </label>
            }
          </div>

          @if (modoElegido() !== MC.RESTRICTIVO) {
            <div class="mt-3 grid grid-cols-2 gap-3 animate-fade-in">
              <ui-campo etiqueta="Máx. puntos por actividad">
                <input
                  [(ngModel)]="formConfig.maxPuntosActividadUsuario"
                  name="maxPuntos"
                  type="number"
                  min="1"
                  max="100"
                  class="campo"
                />
              </ui-campo>
              <ui-campo etiqueta="Máx. activas por integrante">
                <input
                  [(ngModel)]="formConfig.maxActividadesActivasPorUsuario"
                  name="maxActivas"
                  type="number"
                  min="1"
                  max="50"
                  class="campo"
                />
              </ui-campo>
            </div>
          }

          <p class="mt-3 text-xs text-slate-400 dark:text-slate-500">
            Cambiar el modo no toca lo que ya crearon: las actividades activas siguen activas y
            las propuestas pendientes se pueden seguir aprobando.
          </p>

          <div class="mt-3 flex justify-end">
            <button
              type="button"
              (click)="guardarConfig()"
              [disabled]="guardandoConfig()"
              class="boton boton-primario"
            >
              {{ guardandoConfig() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </div>

        <!-- Roles (fase-14-19): pantalla propia, acá solo su estado -->
        <a
          [routerLink]="['/grupos', grupoId(), 'roles']"
          class="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4 transition dark:border-slate-800"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold text-slate-900 dark:text-white">Roles</span>
            <span class="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              {{ resumenRoles() }}
            </span>
          </span>
          <span class="shrink-0 text-sm font-semibold text-marca-600 dark:text-marca-300">
            Editar →
          </span>
        </a>
      }
    </section>
  `,
})
export class BloqueIntegranteComponent {
  readonly grupoId = input.required<string>();

  protected readonly MC = ModoCreacionContenidoUsuario;

  protected readonly OPCIONES_MODO = OPCIONES_MODO;

  private readonly api = inject(ActivityApiService);

  private readonly identity = inject(IdentityApiService);

  private readonly toasts = inject(ToastService);

  protected readonly cargando = signal(true);

  protected readonly guardandoConfig = signal(false);

  protected readonly guardandoPlan = signal(false);

  protected readonly modoElegido = signal<ModoCreacionContenidoUsuario>(
    ModoCreacionContenidoUsuario.RESTRICTIVO
  );

  protected readonly planDelDiaActivo = signal(false);

  protected readonly roles = signal<RolGrupoDto[]>([]);

  protected formConfig = {
    maxPuntosActividadUsuario: 5,
    maxActividadesActivasPorUsuario: 5,
  };

  constructor() {
    effect(() => {
      const g = this.grupoId();
      this.cargar(g);
    });
  }

  protected resumenRoles(): string {
    const n = this.roles().length;

    if (n === 0) {
      return 'Sin roles — todas las actividades las ven todos los integrantes.';
    }

    return `${n} rol${n === 1 ? '' : 'es'}: ${this.roles().map((r) => r.nombre).join(' · ')}`;
  }

  protected guardarConfig(): void {
    this.guardandoConfig.set(true);

    this.api
      .actualizarConfiguracionContenido(this.grupoId(), {
        modoCreacionUsuario: this.modoElegido(),
        maxPuntosActividadUsuario: Number(this.formConfig.maxPuntosActividadUsuario),
        maxActividadesActivasPorUsuario: Number(this.formConfig.maxActividadesActivasPorUsuario),
      })
      .subscribe({
        next: (config) => {
          this.aplicarConfig(config);
          this.guardandoConfig.set(false);
          this.toasts.exito('Configuración guardada.');
        },
        error: (e) => {
          this.toasts.error(mensajeDeError(e));
          this.guardandoConfig.set(false);
        },
      });
  }

  /**
   * fase-14-17: enciende/apaga el plan del día del grupo. Guarda al instante (es
   * un solo interruptor, no un formulario) y revierte el switch si falla.
   */
  protected alternarPlanDelDia(activo: boolean): void {
    this.guardandoPlan.set(true);
    this.planDelDiaActivo.set(activo);

    this.api
      .actualizarConfiguracionContenido(this.grupoId(), { planDelDiaActivo: activo })
      .subscribe({
        next: (config) => {
          this.aplicarConfig(config);
          this.guardandoPlan.set(false);
          this.toasts.exito(
            activo
              ? 'Plan del día activado: cada integrante elige sus opcionales.'
              : 'Plan del día desactivado: vuelven a verse todas.'
          );
        },
        error: (e) => {
          this.planDelDiaActivo.set(!activo);
          this.toasts.error(mensajeDeError(e));
          this.guardandoPlan.set(false);
        },
      });
  }

  private aplicarConfig(config: ConfiguracionContenidoGrupoDto): void {
    this.modoElegido.set(config.modoCreacionUsuario);
    this.planDelDiaActivo.set(config.planDelDiaActivo);
    this.formConfig = {
      maxPuntosActividadUsuario: config.maxPuntosActividadUsuario,
      maxActividadesActivasPorUsuario: config.maxActividadesActivasPorUsuario,
    };
  }

  private cargar(grupoId: string): void {
    this.cargando.set(true);

    this.api.obtenerConfiguracionContenido(grupoId).subscribe({
      next: (config) => {
        this.aplicarConfig(config);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });

    this.identity.listarRolesGrupo(grupoId).subscribe({
      next: (roles) => this.roles.set(roles),
      error: () => undefined,
    });
  }
}
