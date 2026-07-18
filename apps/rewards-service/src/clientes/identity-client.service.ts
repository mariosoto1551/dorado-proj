import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { GrupoDto, UsuarioDto } from '@dorado/shared-types';

const TIMEOUT_MS = 2000;

/**
 * Cliente REST interno hacia identity-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público.
 *
 * Usos en esta fase: validar pertenencia de grupo en escrituras de ORG_ADMIN
 * (regla 3 de CLAUDE.md) y validar el usuario objetivo de elegibles/canjes
 * (misma organización, grupo accesible). Fail-closed (503) si identity no
 * responde: es una validación de aislamiento, nunca se adivina.
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

  /** Grupo por id, o `null` si identity responde 404. */
  async obtenerGrupo(grupoId: string): Promise<GrupoDto | null> {
    return await this.obtener<GrupoDto>(`/internal/identity/grupos/${grupoId}`);
  }

  /** Usuario por id, o `null` si identity responde 404. */
  async obtenerUsuario(usuarioId: string): Promise<UsuarioDto | null> {
    return await this.obtener<UsuarioDto>(`/internal/identity/usuarios/${usuarioId}`);
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
        'No se pudo consultar identity — reintentá en unos segundos'
      );
    }

    if (respuesta.status === 404) {
      return null;
    }

    if (!respuesta.ok) {
      this.logger.warn(`GET ${ruta} respondió ${respuesta.status}`);

      throw new ServiceUnavailableException(
        'No se pudo consultar identity — reintentá en unos segundos'
      );
    }

    return (await respuesta.json()) as T;
  }
}
