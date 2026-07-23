import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import {
  CodigoPlan,
  EstadoOrganizacion,
  type AdminOrganizacionResumenDto,
} from '@dorado/shared-types';

import { AdminApiService } from '../../core/api/admin-api.service';
import { mensajeDeError } from '../../core/api/errores';
import { EstadoChipComponent, PlanChipComponent } from '../../componentes/chips.component';

/**
 * Listado de organizaciones (GET /api/admin/organizaciones). Para el volumen
 * piloto se traen todas de una y se filtra/pagina en cliente (búsqueda y chips
 * instantáneos, sin round-trips). A escala mayor conviene delegar el filtro al
 * backend (los params q/plan/estado ya existen).
 */
@Component({
  selector: 'admin-organizaciones-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlanChipComponent, EstadoChipComponent],
  template: `
    <section class="fade">
      <p class="eyebrow">Plataforma</p>
      <h1 class="page">Organizaciones</h1>
      <p class="sub">Todas las organizaciones registradas en la plataforma.</p>

      @if (cargando()) {
        <div class="loading">Cargando organizaciones…</div>
      } @else if (error()) {
        <div class="banner">⚠ {{ error() }}</div>
      } @else {
        <div class="kpis">
          <div class="kpi">
            <div class="lbl"><span class="dot ac"></span>Organizaciones</div>
            <div class="val tabnums">{{ orgs().length }}</div>
          </div>
          <div class="kpi">
            <div class="lbl"><span class="dot gd"></span>Plan PRO</div>
            <div class="val tabnums">{{ totalPro() }}</div>
          </div>
          <div class="kpi">
            <div class="lbl"><span class="dot ok"></span>Activas</div>
            <div class="val tabnums">{{ totalActivas() }}</div>
          </div>
          <div class="kpi">
            <div class="lbl"><span class="dot dn"></span>Suspendidas</div>
            <div class="val tabnums">{{ totalSuspendidas() }}</div>
          </div>
        </div>

        <div class="toolbar">
          <div class="search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" />
            </svg>
            <input
              type="search"
              placeholder="Buscar por nombre o email…"
              [value]="q()"
              (input)="q.set($any($event.target).value)"
            />
          </div>
          <div class="seg">
            <button type="button" [class.on]="plan() === ''" (click)="plan.set('')">Todos</button>
            <button type="button" [class.on]="plan() === 'FREE'" (click)="plan.set('FREE')">Free</button>
            <button type="button" [class.on]="plan() === 'PRO'" (click)="plan.set('PRO')">Pro</button>
          </div>
          <div class="seg">
            <button type="button" [class.on]="estado() === ''" (click)="estado.set('')">Estado: todos</button>
            <button type="button" [class.on]="estado() === 'ACTIVA'" (click)="estado.set('ACTIVA')">Activas</button>
            <button type="button" [class.on]="estado() === 'SUSPENDIDA'" (click)="estado.set('SUSPENDIDA')">
              Suspendidas
            </button>
          </div>
        </div>

        <div class="card">
          <div class="tablewrap">
            <table class="data">
              <thead>
                <tr>
                  <th>Organización</th>
                  <th>Plan</th>
                  <th>Estado</th>
                  <th style="text-align:right">Grupos</th>
                  <th style="text-align:right">Tutores</th>
                  <th style="text-align:right">Usuarios</th>
                  <th style="text-align:right">Alta</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (o of filtradas(); track o.id) {
                  <tr class="rowlink" (click)="abrir(o.id)">
                    <td>
                      <div class="orgname">{{ o.nombre }}</div>
                      <div class="orgmail mono">{{ o.emailContacto }}</div>
                    </td>
                    <td><admin-plan-chip [plan]="o.plan" /></td>
                    <td><admin-estado-chip [estado]="o.estado" /></td>
                    <td class="num tabnums">{{ o.cantidadGrupos }}</td>
                    <td class="num tabnums">{{ o.cantidadTutores }}</td>
                    <td class="num tabnums">{{ o.cantidadUsuarios }}</td>
                    <td class="num tabnums" style="color:var(--tx-dim)">{{ fecha(o.createdAt) }}</td>
                    <td style="text-align:right"><span class="rowarrow">→</span></td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="8" class="empty">Ninguna organización coincide con el filtro.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </section>
  `,
})
export class OrganizacionesPage {
  private readonly api = inject(AdminApiService);

  private readonly router = inject(Router);

  protected readonly orgs = signal<AdminOrganizacionResumenDto[]>([]);

  protected readonly cargando = signal(true);

  protected readonly error = signal<string | null>(null);

  protected readonly q = signal('');

  protected readonly plan = signal<string>('');

  protected readonly estado = signal<string>('');

  protected readonly totalPro = computed(
    () => this.orgs().filter((o) => o.plan === CodigoPlan.PRO).length
  );

  protected readonly totalActivas = computed(
    () => this.orgs().filter((o) => o.estado === EstadoOrganizacion.ACTIVA).length
  );

  protected readonly totalSuspendidas = computed(
    () => this.orgs().filter((o) => o.estado === EstadoOrganizacion.SUSPENDIDA).length
  );

  protected readonly filtradas = computed(() => {
    const q = this.q().trim().toLowerCase();
    const plan = this.plan();
    const estado = this.estado();

    return this.orgs().filter(
      (o) =>
        (!q || `${o.nombre} ${o.emailContacto}`.toLowerCase().includes(q)) &&
        (!plan || o.plan === plan) &&
        (!estado || o.estado === estado)
    );
  });

  constructor() {
    this.cargar();
  }

  protected abrir(id: string): void {
    void this.router.navigate(['/organizaciones', id]);
  }

  protected fecha(iso: string): string {
    return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private cargar(): void {
    this.api.listarOrganizaciones({ pageSize: 100 }).subscribe({
      next: (res) => {
        this.orgs.set(res.items);
        this.cargando.set(false);
      },
      error: (err) => {
        this.error.set(mensajeDeError(err));
        this.cargando.set(false);
      },
    });
  }
}
