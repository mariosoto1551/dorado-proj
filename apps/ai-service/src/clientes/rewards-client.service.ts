import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ConfiguracionRecompensasInternaDto,
  EtiquetaInternaDto,
  RecompensaDto,
  RendimientoAccionInternoDto,
  TiendaInternaDto,
} from '@dorado/shared-types';

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

  /**
   * Productos y bolsas (fase-14-30 tanda 1). Es la lectura de la que sale el
   * `productoId` que `proponer_precios_tienda` pedía y nadie devolvía.
   *
   * La tienda vacía y la tienda que no se pudo leer se ven igual desde acá —
   * como en las otras lecturas: el modelo se entera de que no hay nada para
   * proponer, que es lo mismo que necesita saber en los dos casos.
   */
  async tienda(grupoId: string): Promise<TiendaInternaDto> {
    return (
      (await this.get<TiendaInternaDto>(`/internal/rewards/grupos/${grupoId}/tienda`)) ?? {
        productos: [],
        bolsas: [],
      }
    );
  }

  /** Catálogo de etiquetas (fase-14-30 tanda 3): sin ids no se asigna ninguna. */
  async etiquetas(grupoId: string, estado?: string): Promise<EtiquetaInternaDto[]> {
    const sufijo = estado ? `?estado=${encodeURIComponent(estado)}` : '';

    return (
      (await this.get<EtiquetaInternaDto[]>(
        `/internal/rewards/grupos/${grupoId}/etiquetas${sufijo}`
      )) ?? []
    );
  }

  /**
   * Modo de recompensas y moneda del Grupo (fase-14-30 tanda 3). `null` si no
   * se pudo leer: decir «DIRECTO» sin saberlo haría que el asistente descarte
   * la tienda de un grupo que sí la usa.
   */
  async configuracion(grupoId: string): Promise<ConfiguracionRecompensasInternaDto | null> {
    return await this.get<ConfiguracionRecompensasInternaDto>(
      `/internal/rewards/grupos/${grupoId}/configuracion`
    );
  }
}
