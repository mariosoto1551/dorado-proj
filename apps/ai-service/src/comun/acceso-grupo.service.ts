import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { Rol, TenantContext } from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';

/**
 * Contexto con el que se ejecuta una herramienta de lectura.
 *
 * **No se construye a mano en ningún lado**: el único camino es
 * `AccesoGrupoService.contextoPara`, que valida antes de devolverlo. Es la
 * decisión 9 del ítem hecha tipo — el ejecutor no puede recibir un grupo que
 * nadie chequeó porque no hay forma de fabricar uno de estos sin pasar por la
 * validación.
 */
export interface ContextoHerramienta {
  readonly organizacionId: string;
  readonly grupoId: string;
}

/**
 * Valida el acceso del principal al Grupo sobre el que va a leer el asistente
 * (regla 3 de CLAUDE.md: el cliente nunca decide sobre qué tenant se lee).
 *
 * **Por qué acá el chequeo del ORG_ADMIN no se puede saltear**, a diferencia de
 * los otros servicios: allá una lectura con un `grupoId` ajeno la vuelve
 * inofensiva el filtro automático de tenant de Prisma (devuelve lista vacía).
 * `ai-service` no tiene tablas propias con estos datos — los pide por REST
 * interno con el `grupoId` como parámetro, y los endpoints internos confían en
 * el llamador. Si acá no se valida la pertenencia, no la valida nadie. Es
 * exactamente el criterio de aceptación 4 de la spec.
 */
@Injectable()
export class AccesoGrupoService {
  constructor(private readonly identity: IdentityClientService) {}

  /**
   * Devuelve el contexto de ejecución, o lanza si el principal no tiene acceso.
   *
   * - TUTOR: el JWT ya trae sus grupos — chequeo local, sin red.
   * - ORG_ADMIN: `grupoIds` viene vacío por diseño (ADR-00 §3), así que la
   *   pertenencia del Grupo a SU organización se resuelve vía REST interno.
   *
   * Un Grupo de otra organización devuelve 404 y no 403: no se confirma que
   * exista, mismo criterio que el resto del monorepo.
   */
  async contextoPara(tenant: TenantContext, grupoId: string): Promise<ContextoHerramienta> {
    if (tenant.rol === Rol.ORG_ADMIN) {
      const grupo = await this.identity.grupo(grupoId);

      if (!grupo || grupo.organizacionId !== tenant.organizacionId) {
        throw new NotFoundException('Grupo no encontrado');
      }

      return { organizacionId: tenant.organizacionId, grupoId };
    }

    if (!tenant.grupoIds.includes(grupoId)) {
      throw new ForbiddenException('Sin acceso a ese grupo');
    }

    return { organizacionId: tenant.organizacionId, grupoId };
  }
}
