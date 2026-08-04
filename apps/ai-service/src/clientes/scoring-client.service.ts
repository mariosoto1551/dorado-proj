import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ResumenPuntajesGrupoDto, UmbralZonaDto } from '@dorado/shared-types';

import { ClienteInternoBase } from './cliente-interno.base';

/**
 * Lectura de scoring-service (fase-14-29 tanda 3): las zonas del Grupo y cómo
 * viene cada participante en la Sección más reciente.
 *
 * Las zonas son lo que hace calibrable cualquier propuesta de valores: sin
 * ellas, "que tender la cama valga 5" es un número sin escala.
 */
@Injectable()
export class ScoringClientService extends ClienteInternoBase {
  constructor(config: ConfigService) {
    super(config, 'SCORING_INTERNAL_URL', ScoringClientService.name);
  }

  async umbrales(grupoId: string): Promise<UmbralZonaDto[]> {
    return (await this.get<UmbralZonaDto[]>(`/internal/scoring/grupos/${grupoId}/umbrales`)) ?? [];
  }

  async resumenPuntajes(grupoId: string): Promise<ResumenPuntajesGrupoDto | null> {
    return await this.get<ResumenPuntajesGrupoDto>(
      `/internal/scoring/grupos/${grupoId}/resumen-puntajes`
    );
  }
}
