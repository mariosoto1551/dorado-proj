import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import { GrupoDto, TutorDto, UsuarioDto } from '@dorado/shared-types';

const TIMEOUT_MS = 2000;

/**
 * Cliente REST interno hacia identity-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público.
 *
 * Usos (spec fase-09): resolver destinatarios ("Tutores del grupo", "todos
 * los Usuarios del grupo") y nombres legibles para las plantillas — los
 * payloads de eventos solo traen IDs a propósito. Un fallo de red/5xx lanza
 * 503 (el consumidor reintenta/DLQ); un 404 devuelve null y la plantilla usa
 * texto de fallback (mejor una notificación genérica que una perdida).
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

  async obtenerGrupo(grupoId: string): Promise<GrupoDto | null> {
    return await this.obtener<GrupoDto>(`/internal/identity/grupos/${grupoId}`);
  }

  async obtenerUsuario(usuarioId: string): Promise<UsuarioDto | null> {
    return await this.obtener<UsuarioDto>(`/internal/identity/usuarios/${usuarioId}`);
  }

  /** Usuarios ACTIVO del grupo (identity ya filtra por estado, fase-02). */
  async usuariosDelGrupo(grupoId: string): Promise<UsuarioDto[]> {
    return (
      (await this.obtener<UsuarioDto[]>(`/internal/identity/grupos/${grupoId}/usuarios`)) ?? []
    );
  }

  /** Tutores efectivos del grupo: asignados + ORG_ADMIN (interno de fase-09). */
  async tutoresDelGrupo(grupoId: string): Promise<TutorDto[]> {
    return (
      (await this.obtener<TutorDto[]>(`/internal/identity/grupos/${grupoId}/tutores`)) ?? []
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
