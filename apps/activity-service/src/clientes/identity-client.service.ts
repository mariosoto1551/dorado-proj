import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getCorrelationId } from '@dorado/shared-logging';
import {
  EquipoInternoDto,
  GrupoDto,
  RolAsignadoDto,
  RolGrupoInternoDto,
  TutorDto,
  UsuarioDto,
} from '@dorado/shared-types';

const TIMEOUT_MS = 2000;

/**
 * Cliente REST interno hacia identity-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público.
 *
 * Usos: validar que un `grupoId` recibido por URL pertenece a la organización
 * del JWT antes de escribir (regla 3 de CLAUDE.md — el cliente nunca decide
 * el tenant), validar el usuario objetivo de un registro (fase-07) y obtener
 * `Grupo.timezone` para el chequeo de deadline.
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
    return await this.obtener<GrupoDto>(`/internal/identity/grupos/${grupoId}`);
  }

  /** Usuario por id, o `null` si identity responde 404. Misma semántica. */
  async obtenerUsuario(usuarioId: string): Promise<UsuarioDto | null> {
    return await this.obtener<UsuarioDto>(`/internal/identity/usuarios/${usuarioId}`);
  }

  /**
   * Equipo por id con su membresía y jefe (fase-14-09), o `null` si 404. Lo usa
   * el completar de tarea de equipo y el reporte del jefe para autorizar y
   * armar el reparto.
   */
  async obtenerEquipo(equipoId: string): Promise<EquipoInternoDto | null> {
    return await this.obtener<EquipoInternoDto>(`/internal/identity/equipos/${equipoId}`);
  }

  /**
   * Usuarios ACTIVO del grupo (identity ya filtra por estado, fase-02). Lo usa
   * el consumidor de SesionCerrada para el castigo automático (fase-14-08).
   */
  async usuariosDelGrupo(grupoId: string): Promise<UsuarioDto[]> {
    const usuarios = await this.obtener<UsuarioDto[]>(
      `/internal/identity/grupos/${grupoId}/usuarios`
    );

    return usuarios ?? [];
  }

  /**
   * Tutores efectivos del grupo (asignados + ORG_ADMIN de la organización).
   * Lo usa el historial de la sesión (fase-14-18) para resolver el nombre de
   * quien registró cada fila, en UNA llamada por request.
   */
  async tutoresDelGrupo(grupoId: string): Promise<TutorDto[]> {
    const tutores = await this.obtener<TutorDto[]>(
      `/internal/identity/grupos/${grupoId}/tutores`
    );

    return tutores ?? [];
  }

  /**
   * Equipos del grupo con su membresía (fase-14-18): el historial necesita el
   * NOMBRE del equipo de una tarea colectiva, y `RegistroTareaEquipo` solo
   * guarda el id. Una llamada por request, no una por fila.
   */
  async equiposDelGrupo(grupoId: string): Promise<EquipoInternoDto[]> {
    const equipos = await this.obtener<EquipoInternoDto[]>(
      `/internal/identity/grupos/${grupoId}/equipos`
    );

    return equipos ?? [];
  }

  /**
   * Catálogo de roles del grupo (fase-14-19): valida `rolesPermitidos` al crear
   * o editar una actividad. Escritura del catálogo, camino frío.
   */
  async rolesDelGrupo(grupoId: string): Promise<RolGrupoInternoDto[]> {
    const roles = await this.obtener<RolGrupoInternoDto[]>(
      `/internal/identity/grupos/${grupoId}/roles`
    );

    return roles ?? [];
  }

  /**
   * Quién tiene qué rol en el grupo (fase-14-19). Este SÍ entra al camino
   * caliente (`mi-estado-hoy`, plan del día, registro, cierre de sesión), por eso
   * devuelve dos ids por participante y no un DTO entero — y por eso quien lo
   * llama debe pedirlo solo si el catálogo tiene alguna actividad restringida
   * (ver `hayRestriccionesDeRol` en comun/restriccion-rol.ts).
   */
  async rolesAsignados(grupoId: string): Promise<RolAsignadoDto[]> {
    const asignados = await this.obtener<RolAsignadoDto[]>(
      `/internal/identity/grupos/${grupoId}/roles-asignados`
    );

    return asignados ?? [];
  }

  /**
   * Rol de UN participante en el grupo, o `null` si no tiene (o si el grupo no
   * usa roles). Atajo sobre `rolesAsignados` para los flujos que solo necesitan
   * el propio: la llamada de red es la misma, evita repetir el `.find` en cada
   * llamador.
   */
  async rolDeUsuario(grupoId: string, usuarioId: string): Promise<string | null> {
    const asignados = await this.rolesAsignados(grupoId);

    return asignados.find((fila) => fila.usuarioId === usuarioId)?.rolGrupoId ?? null;
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
