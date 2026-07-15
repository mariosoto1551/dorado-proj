import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SERVICIOS_INTERNOS } from '../proxy/tabla-ruteo';

export type EstadoServicio = 'up' | 'down' | 'not_configured';

/** Timeout por ping a un servicio interno (spec fase-03). */
const TIMEOUT_PING_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Pinga `GET /internal/health` de cada servicio configurado, en paralelo y
   * con timeout de 2s — un servicio caído no bloquea la respuesta.
   */
  async estadoServicios(): Promise<Record<string, EstadoServicio>> {
    const entradas = await Promise.all(
      SERVICIOS_INTERNOS.map(async (servicio): Promise<[string, EstadoServicio]> => {
        const urlInterna = this.config.get<string>(servicio.envVar);

        if (!urlInterna) {
          return [servicio.nombre, 'not_configured'];
        }

        try {
          const respuesta = await fetch(`${urlInterna}/internal/health`, {
            signal: AbortSignal.timeout(TIMEOUT_PING_MS),
          });

          return [servicio.nombre, respuesta.ok ? 'up' : 'down'];
        } catch {
          return [servicio.nombre, 'down'];
        }
      })
    );

    return Object.fromEntries(entradas);
  }
}
