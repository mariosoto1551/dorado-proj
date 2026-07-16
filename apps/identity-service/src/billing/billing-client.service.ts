import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { CodigoPlan, EntitlementsDto } from '@dorado/shared-types';

/**
 * Timeout de la llamada síncrona a billing (spec fase-04: 2s). Si billing no
 * responde a tiempo, se usa el fallback correspondiente — nunca se rompe el
 * flujo del llamador por una caída de billing.
 */
const TIMEOUT_MS = 2000;

/**
 * Cliente REST interno hacia billing-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público. Reemplaza el
 * placeholder `PlanResolverService` de Fase 2 — es el punto ÚNICO de identity
 * que habla con billing.
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
   * Plan a embeber en el JWT (login/refresh). Fallback explícito de la spec:
   * si billing no responde, `FREE` — el login sigue funcionando (warning en
   * el log, no error fatal).
   */
  async resolvePlan(organizacionId: string): Promise<CodigoPlan> {
    const respuesta = await this.get<{ codigo: CodigoPlan }>(
      `/internal/billing/organizaciones/${organizacionId}/plan`
    );

    return respuesta?.codigo ?? CodigoPlan.FREE;
  }

  /**
   * Entitlements completos (límites + features) para los chequeos previos a
   * crear Grupo/Tutor/Usuario. Devuelve `null` si billing no está disponible:
   * el llamador omite el chequeo con warning (la spec solo define fallback
   * para el login; decisión documentada en docs/progreso/fase-04-billing.md —
   * los límites nunca viven hardcodeados en identity).
   */
  async resolveEntitlements(organizacionId: string): Promise<EntitlementsDto | null> {
    return await this.get<EntitlementsDto>(
      `/internal/billing/organizaciones/${organizacionId}/entitlements`
    );
  }

  private async get<T>(ruta: string): Promise<T | null> {
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

      return (await respuesta.json()) as T;
    } catch (error) {
      this.logger.warn(
        `GET ${ruta} falló (${error instanceof Error ? error.message : String(error)}) — usando fallback`
      );

      return null;
    }
  }
}
