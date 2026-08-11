import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ActividadDto,
  ConductaDto,
  ConfiguracionActividadInternaDto,
  EstadoDeHoyInternoDto,
  ResumenCumplimientoDto,
  SesionDeLaSeccionDto,
  TurnoActividadInternoDto,
} from '@dorado/shared-types';

import { ClienteInternoBase } from './cliente-interno.base';

/**
 * Lectura del catálogo de activity-service (fase-14-29 tanda 3). Alimenta las
 * herramientas `listar_actividades`, `listar_conductas` y
 * `resumen_cumplimiento`.
 *
 * Todo lo de acá es GET — ver `ClienteInternoBase`.
 */
@Injectable()
export class ActivityClientService extends ClienteInternoBase {
  constructor(config: ConfigService) {
    super(config, 'ACTIVITY_INTERNAL_URL', ActivityClientService.name);
  }

  /** Catálogo de actividades del Grupo. Lista vacía si no se pudo leer. */
  async actividades(grupoId: string, estado?: string): Promise<ActividadDto[]> {
    const sufijo = estado ? `?estado=${encodeURIComponent(estado)}` : '';

    return (
      (await this.get<ActividadDto[]>(
        `/internal/activity/grupos/${grupoId}/actividades${sufijo}`
      )) ?? []
    );
  }

  async conductas(grupoId: string, estado?: string): Promise<ConductaDto[]> {
    const sufijo = estado ? `?estado=${encodeURIComponent(estado)}` : '';

    return (
      (await this.get<ConductaDto[]>(`/internal/activity/grupos/${grupoId}/conductas${sufijo}`)) ??
      []
    );
  }

  /**
   * La configuración del Grupo que cambia qué significan otros campos
   * (fase-14-30 tanda 3). `null` si no se pudo leer — un default inventado acá
   * le diría al modelo que el plan del día está apagado cuando no se sabe.
   */
  async configuracion(grupoId: string): Promise<ConfiguracionActividadInternaDto | null> {
    return await this.get<ConfiguracionActividadInternaDto>(
      `/internal/activity/grupos/${grupoId}/configuracion`
    );
  }

  /** Las rotaciones configuradas del Grupo (fase-14-30 tanda 3). */
  async turnos(grupoId: string): Promise<TurnoActividadInternoDto[]> {
    return (
      (await this.get<TurnoActividadInternoDto[]>(
        `/internal/activity/grupos/${grupoId}/turnos`
      )) ?? []
    );
  }

  /** Cuánto se usa cada actividad en los últimos `dias`. `null` si no se pudo leer. */
  async resumenCumplimiento(grupoId: string, dias: number): Promise<ResumenCumplimientoDto | null> {
    return await this.get<ResumenCumplimientoDto>(
      `/internal/activity/grupos/${grupoId}/resumen-cumplimiento?dias=${dias}`
    );
  }

  /**
   * El estado operativo del día (fase-14-31).
   *
   * Si no se pudo leer se devuelve `sesionAbierta: false` y no una lista vacía
   * con la sesión en true: el default seguro es «hoy no se puede anotar», que
   * hace que la propuesta no se arme. Al revés, la IA propondría marcar contra
   * una sesión que no sabe si existe.
   */
  async estadoDeHoy(grupoId: string, sesionId?: string): Promise<EstadoDeHoyInternoDto> {
    // fase-14-33: `sesionId` viene del modelo, así que se encodea — el interno
    // igual valida que sea una Sesión de la Sección vigente.
    const sufijo = sesionId ? `?sesionId=${encodeURIComponent(sesionId)}` : '';

    return (
      (await this.get<EstadoDeHoyInternoDto>(
        `/internal/activity/grupos/${grupoId}/estado-de-hoy${sufijo}`
      )) ?? { sesionAbierta: false, participantes: [] }
    );
  }

  /**
   * Los días de la Sección vigente (fase-14-33), para que el modelo pueda
   * resolver «el lunes» a un id en vez de inventarlo.
   *
   * Lista vacía si no se pudo leer: sin sesiones el modelo no propone nada
   * sobre otro día, que es el default seguro — igual criterio que `estadoDeHoy`.
   */
  async sesionesDeLaSeccion(grupoId: string): Promise<SesionDeLaSeccionDto[]> {
    return (
      (await this.get<SesionDeLaSeccionDto[]>(
        `/internal/activity/grupos/${grupoId}/sesiones`
      )) ?? []
    );
  }
}
