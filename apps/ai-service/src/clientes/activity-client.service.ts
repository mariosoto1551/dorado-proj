import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ActividadDto, ConductaDto, ResumenCumplimientoDto } from '@dorado/shared-types';

import { ClienteInternoBase } from './cliente-interno.base';

/**
 * Lectura del catálogo de activity-service (fase-14-29 tanda 3). Alimenta las
 * herramientas `listar_actividades`, `listar_conductas` y
 * `resumen_cumplimiento`.
 *
 * Todo lo de acá es GET — ver `ClienteInternoBase`.
 */
@Injectable()
export class ActivityClientService extends ClienteInternoBase {
  constructor(config: ConfigService) {
    super(config, 'ACTIVITY_INTERNAL_URL', ActivityClientService.name);
  }

  /** Catálogo de actividades del Grupo. Lista vacía si no se pudo leer. */
  async actividades(grupoId: string, estado?: string): Promise<ActividadDto[]> {
    const sufijo = estado ? `?estado=${encodeURIComponent(estado)}` : '';

    return (
      (await this.get<ActividadDto[]>(
        `/internal/activity/grupos/${grupoId}/actividades${sufijo}`
      )) ?? []
    );
  }

  async conductas(grupoId: string, estado?: string): Promise<ConductaDto[]> {
    const sufijo = estado ? `?estado=${encodeURIComponent(estado)}` : '';

    return (
      (await this.get<ConductaDto[]>(`/internal/activity/grupos/${grupoId}/conductas${sufijo}`)) ??
      []
    );
  }

  /** Cuánto se usa cada actividad en los últimos `dias`. `null` si no se pudo leer. */
  async resumenCumplimiento(grupoId: string, dias: number): Promise<ResumenCumplimientoDto | null> {
    return await this.get<ResumenCumplimientoDto>(
      `/internal/activity/grupos/${grupoId}/resumen-cumplimiento?dias=${dias}`
    );
  }
}
