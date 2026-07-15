import { Controller, Get } from '@nestjs/common';

import { HealthService, type EstadoServicio } from './health.service';

export interface HealthResponse {
  status: 'ok';
  servicios: Record<string, EstadoServicio>;
}

/**
 * GET /api/health — público (está en la lista de rutas exentas de JWT).
 * Es la única ruta que el Gateway atiende por sí mismo; todo lo demás bajo
 * /api se proxya según la tabla de ruteo.
 */
@Controller('api/health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async estado(): Promise<HealthResponse> {
    return {
      status: 'ok',
      servicios: await this.health.estadoServicios(),
    };
  }
}
