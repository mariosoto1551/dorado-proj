import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { ConfiguracionSesionDto } from '@dorado/shared-types';

const TIMEOUT_MS = 2000;

/**
 * Cliente REST interno hacia session-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público.
 *
 * Uso en esta fase (spec fase-07): `evaluarUmbralesEn` del grupo al consumir
 * SesionCerrada — session devuelve los defaults de modelo si el grupo nunca
 * configuró nada (fase-06), así que nunca hay 404.
 */
@Injectable()
export class SessionClientService {
  private readonly logger = new Logger(SessionClientService.name);

  private readonly baseUrl: string;

  private readonly secreto: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('SESSION_INTERNAL_URL').replace(/\/+$/, '');
    this.secreto = config.getOrThrow<string>('GATEWAY_INTERNAL_SECRET');
  }

  async configuracionDelGrupo(grupoId: string): Promise<ConfiguracionSesionDto> {
    const ruta = `/internal/session/grupos/${grupoId}/configuracion`;
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
        'No se pudo consultar session — reintentá en unos segundos'
      );
    }

    if (!respuesta.ok) {
      this.logger.warn(`GET ${ruta} respondió ${respuesta.status}`);

      throw new ServiceUnavailableException(
        'No se pudo consultar session — reintentá en unos segundos'
      );
    }

    return (await respuesta.json()) as ConfiguracionSesionDto;
  }
}
