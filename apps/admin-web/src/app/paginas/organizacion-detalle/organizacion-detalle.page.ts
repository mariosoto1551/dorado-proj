import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  CodigoPlan,
  EstadoOrganizacion,
  type AdminOrganizacionDetalleDto,
} from '@dorado/shared-types';

import { AdminApiService } from '../../core/api/admin-api.service';
import { mensajeDeError } from '../../core/api/errores';
import { ConfirmDialogComponent } from '../../componentes/confirm-dialog.component';
import { EstadoChipComponent, PlanChipComponent } from '../../componentes/chips.component';
import { ToastService } from '../../componentes/toast.service';

type Modal = 'plan' | 'estado' | null;

/** Detalle de una organización (GET /api/admin/organizaciones/:id) + acciones. */
@Component({
  selector: 'admin-organizacion-detalle-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PlanChipComponent, EstadoChipComponent, ConfirmDialogComponent],
  template: `
    <section class="fade">
      <div class="crumbs">
        <a routerLink="/organizaciones">Organizaciones</a><span>/</span
        ><span>{{ detalle()?.organizacion?.nombre ?? '—' }}</span>
      </div>

      @if (cargando()) {
        <div class="loading">Cargando organización…</div>
      } @else if (error()) {
        <div class="banner">⚠ {{ error() }}</div>
      } @else if (detalle(); as d) {
        @if (d.organizacion.estado === 'SUSPENDIDA') {
          <div class="banner">
            ⚠ Organización suspendida — sus tutores y usuarios no pueden iniciar sesión.
          </div>
        }

        <div class="dhead">
          <div class="title">
            <h1 class="page">{{ d.organizacion.nombre }}</h1>
            <div class="badges">
              <admin-plan-chip [plan]="d.plan" />
              <admin-estado-chip [estado]="d.organizacion.estado" />
            </div>
          </div>
          <div class="actions">
            <button type="button" class="btn primary" [disabled]="aplicando()" (click)="modal.set('plan')">
              Cambiar a {{ planDestino() }}
            </button>
            <button
              type="button"
              class="btn"
              [class.danger]="!estaSuspendida()"
              [disabled]="aplicando()"
              (click)="modal.set('estado')"
            >
              {{ estaSuspendida() ? 'Reactivar' : 'Suspender' }}
            </button>
          </div>
        </div>

        <div class="grid2">
          <div class="stack">
            <div class="panel">
              <h2>Grupos</h2>
              @if (d.grupos.length) {
                <div class="grouplist">
                  @for (g of d.grupos; track g.id) {
                    <div class="grow">
                      <span class="gname">{{ g.nombre }}</span>
                      <span class="tz mono">{{ g.timezone }}</span>
                    </div>
                  }
                </div>
              } @else {
                <div class="muted">Esta organización no tiene grupos.</div>
              }
            </div>

            <div class="panel">
              <h2>Historial administrativo</h2>
              @if (d.historialAdministrativo.length) {
                <div class="grouplist">
                  @for (h of d.historialAdministrativo; track h.id) {
                    <div class="grow">
                      <span class="gname">{{ h.accion }}</span>
                      <span class="tz mono">{{ fecha(h.createdAt) }}</span>
                    </div>
                  }
                </div>
              } @else {
                <div class="muted">Sin acciones registradas todavía.</div>
              }
            </div>
          </div>

          <div class="panel" style="align-self:start">
            <h2>Suscripción</h2>
            <div class="kv"><span class="k">Plan</span><span class="v">{{ d.plan }}</span></div>
            <div class="kv">
              <span class="k">Estado suscripción</span><span class="v">{{ d.suscripcion.estado }}</span>
            </div>
            <div class="kv"><span class="k">Fuente</span><span class="v mono">{{ d.suscripcion.fuente }}</span></div>
            <div class="kv">
              <span class="k">Email de contacto</span><span class="v">{{ d.organizacion.emailContacto }}</span>
            </div>
            <div class="kv"><span class="k">Tutores</span><span class="v tabnums">{{ d.cantidadTutores }}</span></div>
            <div class="kv"><span class="k">Usuarios</span><span class="v tabnums">{{ d.cantidadUsuarios }}</span></div>
            <div class="kv"><span class="k">ID</span><span class="v mono" style="font-size:12px">{{ d.organizacion.id }}</span></div>
          </div>
        </div>

        <admin-confirm-dialog
          [abierto]="modal() === 'plan'"
          titulo="Cambiar plan a {{ planDestino() }}"
          [mensaje]="mensajePlan()"
          [textoConfirmar]="'Cambiar a ' + planDestino()"
          tono="primary"
          [cargando]="aplicando()"
          (confirmar)="confirmarPlan()"
          (cancelar)="modal.set(null)"
        />
        <admin-confirm-dialog
          [abierto]="modal() === 'estado'"
          [titulo]="(estaSuspendida() ? 'Reactivar' : 'Suspender') + ' organización'"
          [mensaje]="mensajeEstado()"
          [textoConfirmar]="estaSuspendida() ? 'Reactivar' : 'Suspender'"
          [tono]="estaSuspendida() ? 'primary' : 'danger'"
          [cargando]="aplicando()"
          (confirmar)="confirmarEstado()"
          (cancelar)="modal.set(null)"
        />
      }
    </section>
  `,
})
export class OrganizacionDetallePage {
  readonly id = input.required<string>();

  private readonly api = inject(AdminApiService);

  private readonly toasts = inject(ToastService);

  protected readonly detalle = signal<AdminOrganizacionDetalleDto | null>(null);

  protected readonly cargando = signal(true);

  protected readonly error = signal<string | null>(null);

  protected readonly modal = signal<Modal>(null);

  protected readonly aplicando = signal(false);

  protected readonly estaSuspendida = computed(
    () => this.detalle()?.organizacion.estado === EstadoOrganizacion.SUSPENDIDA
  );

  protected readonly planDestino = computed(() =>
    this.detalle()?.plan === CodigoPlan.PRO ? CodigoPlan.FREE : CodigoPlan.PRO
  );

  constructor() {
    this.cargar();
  }

  protected mensajePlan(): string {
    const d = this.detalle();

    return d
      ? `La organización "${d.organizacion.nombre}" pasará de ${d.plan} a ${this.planDestino()}. El nuevo plan aplica al próximo inicio de sesión de sus tutores.`
      : '';
  }

  protected mensajeEstado(): string {
    const d = this.detalle();

    if (!d) {
      return '';
    }

    return this.estaSuspendida()
      ? `"${d.organizacion.nombre}" volverá a operar normalmente.`
      : `Al suspender "${d.organizacion.nombre}", sus tutores y usuarios no podrán iniciar sesión (las sesiones activas expiran solas en ≤2h).`;
  }

  protected fecha(iso: string): string {
    return new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  }

  protected confirmarPlan(): void {
    const destino = this.planDestino();

    this.aplicando.set(true);
    this.api.cambiarPlan(this.id(), destino).subscribe({
      next: (res) => {
        this.detalle.update((d) => (d ? { ...d, plan: res.suscripcion.plan, suscripcion: res.suscripcion } : d));
        this.toasts.exito(`Plan cambiado a ${destino}`);
        this.finAccion();
      },
      error: (err) => {
        this.toasts.error(mensajeDeError(err));
        this.finAccion();
      },
    });
  }

  protected confirmarEstado(): void {
    const destino = this.estaSuspendida() ? EstadoOrganizacion.ACTIVA : EstadoOrganizacion.SUSPENDIDA;

    this.aplicando.set(true);
    this.api.cambiarEstado(this.id(), destino).subscribe({
      next: (res) => {
        this.detalle.update((d) => (d ? { ...d, organizacion: res.organizacion } : d));
        this.toasts.exito(destino === EstadoOrganizacion.SUSPENDIDA ? 'Organización suspendida' : 'Organización reactivada');
        this.finAccion();
      },
      error: (err) => {
        this.toasts.error(mensajeDeError(err));
        this.finAccion();
      },
    });
  }

  private finAccion(): void {
    this.aplicando.set(false);
    this.modal.set(null);
  }

  private cargar(): void {
    this.api.detalleOrganizacion(this.id()).subscribe({
      next: (d) => {
        this.detalle.set(d);
        this.cargando.set(false);
      },
      error: (err) => {
        this.error.set(mensajeDeError(err));
        this.cargando.set(false);
      },
    });
  }
}
