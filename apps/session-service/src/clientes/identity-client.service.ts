import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { GrupoDto } from '@dorado/shared-types';

const TIMEOUT_MS = 2000;

/** TTL del caché en memoria de Grupos (spec fase-06: 5 minutos, para que el
 * scheduler no golpee a identity cada minuto por cada grupo automático). */
const CACHE_TTL_MS = 5 * 60 * 1000;

interface EntradaCache {
  grupo: GrupoDto;
  expiraEn: number;
}

/**
 * Cliente REST interno hacia identity-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público.
 *
 * Usos en esta fase: validar que un `grupoId` recibido por URL pertenece a la
 * organización del JWT antes de escribir (regla 3 de CLAUDE.md, solo hace
 * falta para ORG_ADMIN) y obtener `Grupo.timezone` para el scheduler y el
 * cálculo de autocierre (`extender`).
 *
 * Fail-closed (503) si identity no responde — misma decisión que fase-05: es
 * una validación de aislamiento de datos, no de cupo. El scheduler captura la
 * excepción por grupo y reintenta en el próximo tick.
 *
 * Solo se cachean aciertos (grupo existente): un 404 no se cachea para no
 * demorar 5 minutos la visibilidad de un grupo recién creado.
 */
@Injectable()
export class IdentityClientService {
  private readonly logger = new Logger(IdentityClientService.name);

  private readonly baseUrl: string;

  private readonly secreto: string;

  private readonly cache = new Map<string, EntradaCache>();

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('IDENTITY_INTERNAL_URL').replace(/\/+$/, '');
    this.secreto = config.getOrThrow<string>('GATEWAY_INTERNAL_SECRET');
  }

  /**
   * Grupo por id (cacheado 5 min), o `null` si identity responde 404.
   * Cualquier otra falla (timeout, red, 5xx) lanza 503 — el llamador no debe
   * adivinar.
   */
  async obtenerGrupo(grupoId: string): Promise<GrupoDto | null> {
    const cacheado = this.cache.get(grupoId);

    if (cacheado && cacheado.expiraEn > Date.now()) {
      return cacheado.grupo;
    }

    const ruta = `/internal/identity/grupos/${grupoId}`;
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
        'No se pudo consultar el grupo (identity no disponible) — reintentá en unos segundos'
      );
    }

    if (respuesta.status === 404) {
      return null;
    }

    if (!respuesta.ok) {
      this.logger.warn(`GET ${ruta} respondió ${respuesta.status}`);

      throw new ServiceUnavailableException(
        'No se pudo consultar el grupo (identity no disponible) — reintentá en unos segundos'
      );
    }

    const grupo = (await respuesta.json()) as GrupoDto;

    this.cache.set(grupoId, { grupo, expiraEn: Date.now() + CACHE_TTL_MS });

    return grupo;
  }
}
