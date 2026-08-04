import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RecompensaDto, RendimientoAccionInternoDto } from '@dorado/shared-types';

import { ClienteInternoBase } from './cliente-interno.base';

/**
 * Lectura de rewards-service (fase-14-29 tanda 3): el catálogo de recompensas
 * y lo que paga cada acción en monedas (fase-14-28).
 *
 * Son los dos lados de la economía —el gasto y el ingreso— y hay que verlos
 * juntos para calibrar cualquiera de los dos: un precio solo dice algo contra
 * lo que se gana por semana.
 */
@Injectable()
export class RewardsClientService extends ClienteInternoBase {
  constructor(config: ConfigService) {
    super(config, 'REWARDS_INTERNAL_URL', RewardsClientService.name);
  }

  async recompensas(grupoId: string, estado?: string): Promise<RecompensaDto[]> {
    const sufijo = estado ? `?estado=${encodeURIComponent(estado)}` : '';

    return (
      (await this.get<RecompensaDto[]>(
        `/internal/rewards/grupos/${grupoId}/recompensas${sufijo}`
      )) ?? []
    );
  }

  async rendimientos(grupoId: string): Promise<RendimientoAccionInternoDto[]> {
    return (
      (await this.get<RendimientoAccionInternoDto[]>(
        `/internal/rewards/grupos/${grupoId}/rendimientos`
      )) ?? []
    );
  }
}
