import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EquipoInternoDto, GrupoDto, RolGrupoInternoDto, UsuarioDto } from '@dorado/shared-types';

import { ClienteInternoBase } from './cliente-interno.base';

/**
 * Lectura de identity-service (fase-14-29 tanda 3): quiénes son los
 * participantes del Grupo, con sus roles (fase-14-19) y equipos (fase-14-09).
 *
 * **Nunca emails** (Parte E, punto 7). No es una decisión de este archivo sino
 * del DTO: `UsuarioDto` no tiene email — un participante se identifica por
 * `username` y `nombre`, y ninguno de los tres endpoints que se llaman acá
 * expone una dirección. La regla se sostiene sola porque no hay de dónde sacar
 * el dato, que es la única forma en que una regla sobre datos personales
 * sobrevive a las próximas cinco tandas.
 */
@Injectable()
export class IdentityClientService extends ClienteInternoBase {
  constructor(config: ConfigService) {
    super(config, 'IDENTITY_INTERNAL_URL', IdentityClientService.name);
  }

  /**
   * El Grupo por id, o `null` si no existe / no se pudo leer.
   *
   * Lo usa `AccesoGrupoService` para el único caso donde el JWT no alcanza: un
   * ORG_ADMIN viaja con `grupoIds` vacío ("todos los grupos de SU
   * organización"), así que la pertenencia hay que preguntarla. Es la llamada
   * que evita que el asistente lea el grupo de otra organización.
   */
  async grupo(grupoId: string): Promise<GrupoDto | null> {
    return await this.get<GrupoDto>(`/internal/identity/grupos/${grupoId}`);
  }

  async participantes(grupoId: string): Promise<UsuarioDto[]> {
    return (await this.get<UsuarioDto[]>(`/internal/identity/grupos/${grupoId}/usuarios`)) ?? [];
  }

  async roles(grupoId: string): Promise<RolGrupoInternoDto[]> {
    return (await this.get<RolGrupoInternoDto[]>(`/internal/identity/grupos/${grupoId}/roles`)) ?? [];
  }

  async equipos(grupoId: string): Promise<EquipoInternoDto[]> {
    return (
      (await this.get<EquipoInternoDto[]>(`/internal/identity/grupos/${grupoId}/equipos`)) ?? []
    );
  }
}
