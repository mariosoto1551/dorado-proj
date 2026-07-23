import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { CodigoPlan, EntitlementsDto, SuscripcionDto } from '@dorado/shared-types';

import { BillingNoDisponibleException } from '../comun/excepciones';

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

  /**
   * Suscripción vigente de una organización, para el detalle del panel de
   * PLATFORM_ADMIN (fase-14-05). A diferencia de `resolvePlan`, NO tiene
   * fallback: si billing no responde, lanza 503 (el panel no debe mostrar
   * datos de plan potencialmente falsos).
   */
  async obtenerSuscripcion(organizacionId: string): Promise<SuscripcionDto> {
    const respuesta = await this.getObligatorio<SuscripcionDto>(
      `/internal/billing/organizaciones/${organizacionId}/suscripcion`
    );

    return respuesta;
  }

  /** Cambia el plan de una organización (asignación manual del panel). 503 si billing no responde. */
  async cambiarPlan(organizacionId: string, plan: CodigoPlan): Promise<SuscripcionDto> {
    return await this.postObligatorio<SuscripcionDto>(
      `/internal/billing/organizaciones/${organizacionId}/plan`,
      { codigo: plan }
    );
  }

  private async getObligatorio<T>(ruta: string): Promise<T> {
    const respuesta = await this.request<T>('GET', ruta);

    if (respuesta === null) {
      throw new BillingNoDisponibleException();
    }

    return respuesta;
  }

  private async postObligatorio<T>(ruta: string, body: unknown): Promise<T> {
    const respuesta = await this.request<T>('POST', ruta, body);

    if (respuesta === null) {
      throw new BillingNoDisponibleException();
    }

    return respuesta;
  }

  private async get<T>(ruta: string): Promise<T | null> {
    return await this.request<T>('GET', ruta);
  }

  private async request<T>(
    metodo: 'GET' | 'POST',
    ruta: string,
    body?: unknown
  ): Promise<T | null> {
    const correlationId = getCorrelationId();

    try {
      const respuesta = await fetch(`${this.baseUrl}${ruta}`, {
        method: metodo,
        headers: {
          'x-internal-secret': this.secreto,
          ...(body !== undefined && { 'content-type': 'application/json' }),
          ...(correlationId && { 'x-correlation-id': correlationId }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!respuesta.ok) {
        this.logger.warn(`${metodo} ${ruta} respondió ${respuesta.status} — usando fallback`);

        return null;
      }

      return (await respuesta.json()) as T;
    } catch (error) {
      this.logger.warn(
        `${metodo} ${ruta} falló (${error instanceof Error ? error.message : String(error)}) — usando fallback`
      );

      return null;
    }
  }
}
