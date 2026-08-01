import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { UmbralZonaDto } from '@dorado/shared-types';

const TIMEOUT_MS = 2000;

/**
 * Shape del interno `.../resultado` de scoring (fase-07): el snapshot
 * `ResultadoSeccion` completo. shared-types.md no define DTO para esto — el
 * shape quedó documentado en docs/progreso/fase-07-scoring-engine.md.
 */
export interface ResultadoSeccionInterno {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  seccionId: string;
  puntajeTotal: number;
  umbralZonaId: string | null;
  nombreZona: string | null;
  descalificado: boolean;
  calculadoEn: string;
}

/**
 * Cliente REST interno hacia scoring-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público.
 *
 * Usos (spec fase-08): validar `umbralZonaId` al crear/editar una Recompensa
 * y consultar el `ResultadoSeccion` para calcular elegibilidad de canje en el
 * momento (la elegibilidad NUNCA se precomputa). Fail-closed (503) si scoring
 * no responde.
 */
@Injectable()
export class ScoringClientService {
  private readonly logger = new Logger(ScoringClientService.name);

  private readonly baseUrl: string;

  private readonly secreto: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('SCORING_INTERNAL_URL').replace(/\/+$/, '');
    this.secreto = config.getOrThrow<string>('GATEWAY_INTERNAL_SECRET');
  }

  /** Umbral por id, o `null` si scoring responde 404. */
  async obtenerUmbral(umbralZonaId: string): Promise<UmbralZonaDto | null> {
    return await this.obtener<UmbralZonaDto>(`/internal/scoring/umbrales/${umbralZonaId}`);
  }

  /**
   * Zonas del Grupo, de la más baja a la más alta (fase-14-22): la pantalla de
   * rendimiento tiene que listar todas, incluidas las que no tienen monedas
   * configuradas todavía.
   */
  async umbralesDelGrupo(grupoId: string): Promise<UmbralZonaDto[]> {
    const umbrales = await this.obtener<UmbralZonaDto[]>(
      `/internal/scoring/grupos/${grupoId}/umbrales`
    );

    return umbrales ?? [];
  }

  /**
   * Resultado de un usuario en una Sección, o `null` si scoring responde 404
   * (la Sección todavía no fue evaluada — ahí no hay canje posible, spec).
   */
  async obtenerResultado(
    usuarioId: string,
    seccionId: string
  ): Promise<ResultadoSeccionInterno | null> {
    return await this.obtener<ResultadoSeccionInterno>(
      `/internal/scoring/usuarios/${usuarioId}/secciones/${seccionId}/resultado`
    );
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
        'No se pudo consultar scoring — reintentá en unos segundos'
      );
    }

    if (respuesta.status === 404) {
      return null;
    }

    if (!respuesta.ok) {
      this.logger.warn(`GET ${ruta} respondió ${respuesta.status}`);

      throw new ServiceUnavailableException(
        'No se pudo consultar scoring — reintentá en unos segundos'
      );
    }

    return (await respuesta.json()) as T;
  }
}
