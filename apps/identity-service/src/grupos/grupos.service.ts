import { Injectable, NotFoundException } from '@nestjs/common';

import { GrupoDto, Rol, TenantContext } from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { LimitePlanAlcanzadoException } from '../comun/excepciones';
import { grupoADto } from '../comun/mapeadores';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearGrupoRequest, EditarGrupoRequest } from './dto/grupos.dto';

@Injectable()
export class GruposService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accesoGrupo: AccesoGrupoService
  ) {}

  async listar(tenant: TenantContext): Promise<GrupoDto[]> {
    // ORG_ADMIN: todos los de la organización. TUTOR: solo los de TutorGrupo (spec).
    if (tenant.rol === Rol.ORG_ADMIN) {
      const grupos = await this.prisma.client.grupo.findMany({
        where: { organizacionId: tenant.organizacionId },
        orderBy: { createdAt: 'asc' },
      });

      return grupos.map(grupoADto);
    }

    const asignaciones = await this.prisma.client.tutorGrupo.findMany({
      where: { tutorId: tenant.principalId },
    });
    const grupos = await this.prisma.client.grupo.findMany({
      where: { id: { in: asignaciones.map((asignacion) => asignacion.grupoId) } },
      orderBy: { createdAt: 'asc' },
    });

    return grupos.map(grupoADto);
  }

  async crear(tenant: TenantContext, datos: CrearGrupoRequest): Promise<GrupoDto> {
    const limite = await this.chequearLimitePlan(tenant.organizacionId);

    if (!limite.permitido) {
      throw new LimitePlanAlcanzadoException('grupos');
    }

    const grupo = await this.prisma.client.$transaction(async (tx) => {
      const nuevoGrupo = await tx.grupo.create({
        data: {
          organizacionId: tenant.organizacionId,
          nombre: datos.nombre,
          timezone: datos.timezone,
        },
      });

      // Un TUTOR (no admin) que crea un grupo queda auto-asignado (spec).
      if (tenant.rol === Rol.TUTOR) {
        await tx.tutorGrupo.create({
          data: { tutorId: tenant.principalId, grupoId: nuevoGrupo.id },
        });
      }

      return nuevoGrupo;
    });

    return grupoADto(grupo);
  }

  async editar(
    tenant: TenantContext,
    grupoId: string,
    datos: EditarGrupoRequest
  ): Promise<GrupoDto> {
    await this.accesoGrupo.asegurarAcceso(tenant, grupoId);

    await this.prisma.client.grupo.updateMany({
      where: { id: grupoId },
      data: {
        ...(datos.nombre !== undefined && { nombre: datos.nombre }),
        ...(datos.timezone !== undefined && { timezone: datos.timezone }),
      },
    });

    const grupo = await this.prisma.client.grupo.findFirst({ where: { id: grupoId } });

    if (!grupo) {
      throw new NotFoundException('Grupo no encontrado');
    }

    return grupoADto(grupo);
  }

  // TODO Fase 4: reemplazar por llamada real a billing-service.
  private async chequearLimitePlan(
    _organizacionId: string
  ): Promise<{ permitido: boolean }> {
    return { permitido: true };
  }
}
