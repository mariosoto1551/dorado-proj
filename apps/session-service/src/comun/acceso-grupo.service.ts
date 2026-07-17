import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { Rol, TenantContext } from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';

/**
 * Valida el acceso del principal al `grupoId` recibido por URL (regla 3 de
 * CLAUDE.md: el cliente nunca decide sobre qué tenant se lee/escribe — todo
 * sale del JWT validado). Mismo patrón que activity-service (fase-05).
 *
 * - TUTOR / USUARIO: el JWT ya trae sus grupos (`grupoIds`) — chequeo local.
 * - ORG_ADMIN: `grupoIds` viene vacío ("todos los grupos de SU organización",
 *   ADR-00 §3), así que la pertenencia del grupo a la organización se resuelve
 *   vía REST interno a identity (ADR-00 §4) — solo en escrituras; en lecturas
 *   el filtro automático por organizacionId ya hace inofensivo un grupo ajeno
 *   (lista vacía).
 */
@Injectable()
export class AccesoGrupoService {
  constructor(private readonly identity: IdentityClientService) {}

  /** Escrituras (PUT/POST sobre /grupos/:grupoId/...): valida pertenencia real. */
  async asegurarAccesoEscritura(tenant: TenantContext, grupoId: string): Promise<void> {
    if (tenant.rol === Rol.ORG_ADMIN) {
      const grupo = await this.identity.obtenerGrupo(grupoId);

      if (!grupo || grupo.organizacionId !== tenant.organizacionId) {
        // 404 también para grupos de otra organización: no revelar existencia.
        throw new NotFoundException('Grupo no encontrado');
      }

      return;
    }

    if (!tenant.grupoIds.includes(grupoId)) {
      throw new ForbiddenException('Sin acceso a ese grupo');
    }
  }

  /**
   * Lecturas (GET de listas): sin REST — corta explícito el caso TUTOR/USUARIO
   * pidiendo un grupo que no es suyo; para ORG_ADMIN el filtro de tenant de
   * Prisma ya limita a su organización.
   */
  asegurarAccesoLectura(tenant: TenantContext, grupoId: string): void {
    if (tenant.grupoIds.length > 0 && !tenant.grupoIds.includes(grupoId)) {
      throw new ForbiddenException('Sin acceso a ese grupo');
    }
  }
}
