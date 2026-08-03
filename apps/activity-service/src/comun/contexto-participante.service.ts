import { Injectable } from '@nestjs/common';

import { IdentityClientService } from '../clientes/identity-client.service';
import {
  ContextoParticipante,
  DestinatarioDeActividad,
  equiposDelParticipante,
  hayRestriccionesDeEquipo,
} from './destinatario';
import { hayRestriccionesDeRol } from './restriccion-rol';

/**
 * Arma el `ContextoParticipante` que necesita `esDestinatario` (spec fase-14-24),
 * pagando **solo los cruces REST que el catálogo realmente exige**.
 *
 * El punto entero de este servicio es esa última parte. `rolGrupoId` y
 * `equipoIds` viven en identity, así que resolverlos siempre serían dos llamadas
 * de red en el camino caliente (`mi-estado-hoy` corre en cada refresco de la
 * pantalla del integrante) para grupos que **no usan ninguna de las dos
 * capacidades** — que es el estado de todos los grupos que existen hoy.
 *
 * Mismo patrón que `hayRestriccionesDeRol` del ítem 19 y que el `necesitaTimezone`
 * de `mi-estado-hoy`: se mira primero el catálogo ya leído y se pregunta a
 * identity solo lo que haga falta. Con un catálogo sin restricciones, cero
 * llamadas nuevas; con los dos modos en uso, dos llamadas **en paralelo**.
 */
@Injectable()
export class ContextoParticipanteService {
  constructor(private readonly identity: IdentityClientService) {}

  /**
   * Contexto para evaluar `actividades` contra `usuarioId`. `actividades` es el
   * catálogo **ya leído** — no se vuelve a consultar la base.
   */
  async resolver(
    grupoId: string,
    usuarioId: string,
    actividades: Array<Pick<DestinatarioDeActividad, 'rolesPermitidos' | 'equiposPermitidos'>>
  ): Promise<ContextoParticipante> {
    const necesitaRol = hayRestriccionesDeRol(actividades);
    const necesitaEquipos = hayRestriccionesDeEquipo(actividades);

    if (!necesitaRol && !necesitaEquipos) {
      return { usuarioId, rolGrupoId: null, equipoIds: [] };
    }

    const [rolGrupoId, equipos] = await Promise.all([
      necesitaRol ? this.identity.rolDeUsuario(grupoId, usuarioId) : Promise.resolve(null),
      necesitaEquipos ? this.identity.equiposDelGrupo(grupoId) : Promise.resolve([]),
    ]);

    return {
      usuarioId,
      rolGrupoId,
      equipoIds: equiposDelParticipante(equipos, usuarioId),
    };
  }

  /**
   * Igual que `resolver` pero para **todos** los participantes de una vez: dos
   * llamadas a identity en total, no dos por persona. Lo usa el cierre de Sesión
   * (fase-14-08), que evalúa el catálogo contra el grupo entero — el único punto
   * donde el N+1 sería real.
   */
  async resolverParaGrupo(
    grupoId: string,
    usuarioIds: string[],
    actividades: Array<Pick<DestinatarioDeActividad, 'rolesPermitidos' | 'equiposPermitidos'>>
  ): Promise<Map<string, ContextoParticipante>> {
    const necesitaRol = hayRestriccionesDeRol(actividades);
    const necesitaEquipos = hayRestriccionesDeEquipo(actividades);

    const [asignados, equipos] = await Promise.all([
      necesitaRol ? this.identity.rolesAsignados(grupoId) : Promise.resolve([]),
      necesitaEquipos ? this.identity.equiposDelGrupo(grupoId) : Promise.resolve([]),
    ]);

    const rolPorUsuario = new Map(asignados.map((fila) => [fila.usuarioId, fila.rolGrupoId]));

    return new Map(
      usuarioIds.map((usuarioId) => [
        usuarioId,
        {
          usuarioId,
          rolGrupoId: rolPorUsuario.get(usuarioId) ?? null,
          equipoIds: equiposDelParticipante(equipos, usuarioId),
        },
      ])
    );
  }
}
