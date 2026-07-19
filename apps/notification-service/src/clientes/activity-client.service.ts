import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { ActividadDto, ConductaDto } from '@dorado/shared-types';

const TIMEOUT_MS = 2000;

/**
 * Cliente REST interno hacia activity-service (ADR-00 §4): nombres de
 * actividades/conductas para las plantillas (internos agregados en fase-09).
 * Misma semántica que el identity-client: 404 → null (fallback de texto),
 * red/5xx → 503 (reintento/DLQ del consumidor).
 */
@Injectable()
export class ActivityClientService {
  private readonly logger = new Logger(ActivityClientService.name);

  private readonly baseUrl: string;

  private readonly secreto: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('ACTIVITY_INTERNAL_URL').replace(/\/+$/, '');
    this.secreto = config.getOrThrow<string>('GATEWAY_INTERNAL_SECRET');
  }

  async obtenerActividad(actividadId: string): Promise<ActividadDto | null> {
    return await this.obtener<ActividadDto>(`/internal/activity/actividades/${actividadId}`);
  }

  async obtenerConducta(conductaId: string): Promise<ConductaDto | null> {
    return await this.obtener<ConductaDto>(`/internal/activity/conductas/${conductaId}`);
  }

  private async obtener<T>(ruta: string): Promise<T | null> {
    const correlationId = getCorrelationId();

    let respuesta: Response;

    try {
      respuesta = await fetch(`${this.baseUrl}${ruta}`, {
        headers: {
          'x-internal-secret': this.secreto,
          ...(correlationId && { 'x-correlation-id': correlationId }),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(
        `GET ${ruta} falló (${error instanceof Error ? error.message : String(error)})`
      );

      throw new ServiceUnavailableException(
        'No se pudo consultar activity — reintentá en unos segundos'
      );
    }

    if (respuesta.status === 404) {
      return null;
    }

    if (!respuesta.ok) {
      this.logger.warn(`GET ${ruta} respondió ${respuesta.status}`);

      throw new ServiceUnavailableException(
        'No se pudo consultar activity — reintentá en unos segundos'
      );
    }

    return (await respuesta.json()) as T;
  }
}
