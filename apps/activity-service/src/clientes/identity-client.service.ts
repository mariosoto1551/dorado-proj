import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { GrupoDto } from '@dorado/shared-types';

const TIMEOUT_MS = 2000;

/**
 * Cliente REST interno hacia identity-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público.
 *
 * Uso en esta fase: validar que un `grupoId` recibido por URL pertenece a la
 * organización del JWT antes de escribir (regla 3 de CLAUDE.md — el cliente
 * nunca decide el tenant). Solo hace falta para ORG_ADMIN: un TUTOR/USUARIO
 * ya trae sus grupos válidos en el JWT.
 *
 * A diferencia del chequeo de límites (fail-open), acá una caída de identity
 * es fail-closed (503): es una validación de aislamiento de datos, no de
 * cupo — y con identity caído tampoco hay logins, así que la ventana real es
 * mínima.
 */
@Injectable()
export class IdentityClientService {
  private readonly logger = new Logger(IdentityClientService.name);

  private readonly baseUrl: string;

  private readonly secreto: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('IDENTITY_INTERNAL_URL').replace(/\/+$/, '');
    this.secreto = config.getOrThrow<string>('GATEWAY_INTERNAL_SECRET');
  }

  /**
   * Grupo por id, o `null` si identity responde 404. Cualquier otra falla
   * (timeout, red, 5xx) lanza 503 — el llamador no debe adivinar.
   */
  async obtenerGrupo(grupoId: string): Promise<GrupoDto | null> {
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
        'No se pudo validar el grupo (identity no disponible) — reintentá en unos segundos'
      );
    }

    if (respuesta.status === 404) {
      return null;
    }

    if (!respuesta.ok) {
      this.logger.warn(`GET ${ruta} respondió ${respuesta.status}`);

      throw new ServiceUnavailableException(
        'No se pudo validar el grupo (identity no disponible) — reintentá en unos segundos'
      );
    }

    return (await respuesta.json()) as GrupoDto;
  }
}
