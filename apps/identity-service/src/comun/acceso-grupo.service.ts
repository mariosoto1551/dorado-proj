import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { Rol, TenantContext } from '@dorado/shared-types';

import type { Grupo } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Regla de acceso a Grupo (fase-02, "Reglas de negocio"):
 * - ORG_ADMIN: acceso implícito a TODOS los grupos de su organización, sin
 *   fila en TutorGrupo (ADR-00 §1).
 * - TUTOR: solo los grupos con fila en TutorGrupo. La fuente de verdad es la
 *   BASE, no el snapshot `grupoIds` del JWT — un tutor que creó un grupo
 *   después del login debe poder operarlo sin esperar el refresh del token.
 */
@Injectable()
export class AccesoGrupoService {
  constructor(private readonly prisma: PrismaService) {}

  async asegurarAcceso(tenant: TenantContext, grupoId: string): Promise<Grupo> {
    const grupo = await this.prisma.client.grupo.findFirst({ where: { id: grupoId } });

    // La extensión de tenant ya filtra por organizacionId; el chequeo explícito
    // es defensa en profundidad (y cubre contextos sin tenant en tests).
    if (!grupo || grupo.organizacionId !== tenant.organizacionId) {
      throw new NotFoundException('Grupo no encontrado');
    }

    if (tenant.rol === Rol.TUTOR) {
      const asignacion = await this.prisma.client.tutorGrupo.findFirst({
        where: { tutorId: tenant.principalId, grupoId },
      });

      if (!asignacion) {
        throw new ForbiddenException('No estás asignado a este grupo');
      }
    }

    return grupo;
  }
}
