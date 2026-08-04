import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { EntitlementsDto } from '@dorado/shared-types';

/**
 * Timeout de las llamadas síncronas internas (mismo criterio que fase-04: 2s).
 */
const TIMEOUT_MS = 2000;

/**
 * Cliente REST interno hacia billing-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público. Mismo patrón que el
 * BillingClientService de activity (fase-05).
 *
 * **Diferencia deliberada con los otros servicios: acá NO hay fail-open.** En
 * activity, si billing no responde se omite el chequeo de límite con un
 * warning, porque el costo de un falso negativo es una actividad de más. Acá
 * el entitlement decide si se gasta dinero real de la plataforma contra un
 * proveedor externo, así que billing caído significa **asistente apagado**
 * hasta que vuelva. Devolver null y que el llamador corte es la decisión, y
 * está en el nombre del método.
 */
@Injectable()
export class BillingClientService {
  private readonly logger = new Logger(BillingClientService.name);

  private readonly baseUrl: string;

  private readonly secreto: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('BILLING_INTERNAL_URL').replace(/\/+$/, '');
    this.secreto = config.getOrThrow<string>('GATEWAY_INTERNAL_SECRET');
  }

  /**
   * Entitlements de la organización. Devuelve `null` si billing no está
   * disponible; el llamador trata `null` como "sin feature" (fail-closed),
   * no como "seguí adelante".
   */
  async resolveEntitlements(organizacionId: string): Promise<EntitlementsDto | null> {
    const ruta = `/internal/billing/organizaciones/${organizacionId}/entitlements`;
    const correlationId = getCorrelationId();

    try {
      const respuesta = await fetch(`${this.baseUrl}${ruta}`, {
        headers: {
          'x-internal-secret': this.secreto,
          ...(correlationId && { 'x-correlation-id': correlationId }),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!respuesta.ok) {
        this.logger.warn(`GET ${ruta} respondió ${respuesta.status} — el asistente queda apagado`);

        return null;
      }

      return (await respuesta.json()) as EntitlementsDto;
    } catch (error) {
      this.logger.warn(
        `GET ${ruta} falló (${error instanceof Error ? error.message : String(error)}) — el asistente queda apagado`
      );

      return null;
    }
  }
}
