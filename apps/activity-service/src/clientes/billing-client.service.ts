import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { EntitlementsDto } from '@dorado/shared-types';

/**
 * Timeout de las llamadas síncronas internas (mismo criterio que fase-04: 2s).
 * Si el otro servicio no responde a tiempo se usa el fallback del llamador.
 */
const TIMEOUT_MS = 2000;

/**
 * Cliente REST interno hacia billing-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público. Mismo patrón que
 * el BillingClientService de identity (fase-04) — solo entitlements: activity
 * no necesita resolver plan (el plan del JWT lo embebe identity).
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
   * Entitlements para el chequeo previo a crear una Actividad. Devuelve `null`
   * si billing no está disponible: el llamador omite el chequeo con warning
   * (misma decisión fail-open que fase-04, documentada en
   * docs/progreso/fase-04-billing.md — los límites nunca viven hardcodeados
   * fuera de billing).
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
        this.logger.warn(`GET ${ruta} respondió ${respuesta.status} — usando fallback`);

        return null;
      }

      return (await respuesta.json()) as EntitlementsDto;
    } catch (error) {
      this.logger.warn(
        `GET ${ruta} falló (${error instanceof Error ? error.message : String(error)}) — usando fallback`
      );

      return null;
    }
  }
}
