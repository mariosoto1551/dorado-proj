import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { CatalogoRendibleDto, ConductaDto } from '@dorado/shared-types';

const TIMEOUT_MS = 2000;

/**
 * Cliente REST interno hacia activity-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público.
 *
 * Único uso (fase-14-28 D.3): traer el catálogo que puede rendir monedas, para
 * listar la pantalla de rendimientos por acción y para validar cada `origenId`
 * del `PUT`. Es el mismo patrón que `ScoringClientService` con las zonas — y
 * por el mismo motivo: rewards referencia a activity_db SOLO por ID (regla 2),
 * así que la única forma de saber si una actividad existe, está activa y es de
 * ESTE grupo es preguntárselo a activity.
 *
 * Fail-closed (503) si activity no responde: mejor no poder configurar que
 * guardar un `origenId` que quizás no existe.
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

  /**
   * Actividades ACTIVA + conductas BUENA ACTIVA del Grupo. Un grupo sin
   * catálogo devuelve las dos listas vacías, no un 404.
   */
  async catalogoRendible(grupoId: string): Promise<CatalogoRendibleDto> {
    const catalogo = await this.obtener<CatalogoRendibleDto>(
      `/internal/activity/grupos/${grupoId}/catalogo-rendible`
    );

    return catalogo ?? { actividades: [], conductas: [] };
  }

  /**
   * Una conducta por id, o `null` si no existe. Se usa SOLO en el camino de
   * error del `PUT`: cuando un `origenId` de conducta no está en el catálogo
   * rendible, esto distingue «no existe» de «existe pero es MALA», que la
   * decisión 17 quiere reportar con su propio code. Cuesta una llamada extra
   * únicamente cuando el request ya venía mal.
   */
  async conducta(conductaId: string): Promise<ConductaDto | null> {
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
