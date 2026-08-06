import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { ConfiguracionSesionDto, SeccionDto, SesionDto } from '@dorado/shared-types';

const TIMEOUT_MS = 2000;

/** Shape del interno `secciones/actual` (fase-06): la Sección no-CERRADA más
 * reciente CON sus sesiones; cuerpo vacío = null. Mismo tipo que el de
 * activity-service — el endpoint es uno solo. */
export type SeccionActualInterna = SeccionDto & { sesiones: SesionDto[] };

/**
 * Cliente REST interno hacia session-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público.
 *
 * Usos: `evaluarUmbralesEn` del grupo al consumir SesionCerrada (spec fase-07)
 * — session devuelve los defaults de modelo si el grupo nunca configuró nada
 * (fase-06), así que nunca hay 404 — y la Sesión abierta donde cae un ajuste
 * manual de puntos (fase-14-31), que es la misma resolución que hace activity
 * al registrar.
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
    return await this.obtener<ConfiguracionSesionDto>(
      `/internal/session/grupos/${grupoId}/configuracion`
    );
  }

  /**
   * Sección vigente (no-CERRADA) del grupo con sus sesiones, o `null` si no hay
   * ninguna — session responde 200 con cuerpo vacío en ese caso, y por eso el
   * `null` se distingue leyendo el texto y no por el status.
   */
  async obtenerSeccionActual(grupoId: string): Promise<SeccionActualInterna | null> {
    const crudo = await this.obtenerTexto(
      `/internal/session/grupos/${grupoId}/secciones/actual`
    );

    if (crudo.trim() === '') {
      return null;
    }

    return JSON.parse(crudo) as SeccionActualInterna;
  }

  private async obtener<T>(ruta: string): Promise<T> {
    return JSON.parse(await this.obtenerTexto(ruta)) as T;
  }

  private async obtenerTexto(ruta: string): Promise<string> {
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

    return await respuesta.text();
  }
}
