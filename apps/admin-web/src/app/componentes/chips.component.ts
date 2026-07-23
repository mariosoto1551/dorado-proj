import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { CodigoPlan, EstadoOrganizacion } from '@dorado/shared-types';

/** Chip de plan (PRO en dorado, FREE neutro). */
@Component({
  selector: 'admin-plan-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip" [class.pro]="esPro()" [class.free]="!esPro()">
      <span class="d"></span>{{ plan() }}
    </span>
  `,
})
export class PlanChipComponent {
  readonly plan = input.required<CodigoPlan>();

  protected esPro(): boolean {
    return this.plan() === CodigoPlan.PRO;
  }
}

/** Chip de estado de organización (Activa verde / Suspendida rojo). */
@Component({
  selector: 'admin-estado-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip" [class.activa]="esActiva()" [class.susp]="!esActiva()">
      <span class="d"></span>{{ esActiva() ? 'Activa' : 'Suspendida' }}
    </span>
  `,
})
export class EstadoChipComponent {
  readonly estado = input.required<EstadoOrganizacion>();

  protected esActiva(): boolean {
    return this.estado() === EstadoOrganizacion.ACTIVA;
  }
}
