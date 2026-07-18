import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { SeccionDto, SesionDto } from '@dorado/shared-types';

const TIMEOUT_MS = 2000;

/** Shape del interno `secciones/actual` de session-service (fase-06: la
 * Sección no-CERRADA más reciente CON sus sesiones; cuerpo vacío = null). */
export type SeccionActualInterna = SeccionDto & { sesiones: SesionDto[] };

/**
 * Cliente REST interno hacia session-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público.
 *
 * Uso en esta fase (spec fase-07, validación 3 de `completar`): resolver en
 * qué Sección/Sesión ABIERTA registrar. Fail-closed (503) si session no
 * responde: sin Sesión resuelta no hay registro válido posible.
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

  /**
   * Sección vigente (no-CERRADA) del grupo con sus sesiones, o `null` si no
   * hay ninguna (session responde 200 con cuerpo vacío en ese caso).
   */
  async obtenerSeccionActual(grupoId: string): Promise<SeccionActualInterna | null> {
    const ruta = `/internal/session/grupos/${grupoId}/secciones/actual`;
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
        'No se pudo resolver la sesión actual (session no disponible) — reintentá en unos segundos'
      );
    }

    if (!respuesta.ok) {
      this.logger.warn(`GET ${ruta} respondió ${respuesta.status}`);

      throw new ServiceUnavailableException(
        'No se pudo resolver la sesión actual (session no disponible) — reintentá en unos segundos'
      );
    }

    const cuerpo = await respuesta.text();

    if (!cuerpo) {
      return null;
    }

    return JSON.parse(cuerpo) as SeccionActualInterna;
  }
}
