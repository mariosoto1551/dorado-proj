import { Injectable, NotFoundException } from '@nestjs/common';

import { TenantContext, TutorDto } from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { tutorADto } from '../comun/mapeadores';
import { EstadoCuenta } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TutoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accesoGrupo: AccesoGrupoService
  ) {}

  async listarPorGrupo(tenant: TenantContext, grupoId: string): Promise<TutorDto[]> {
    await this.accesoGrupo.asegurarAcceso(tenant, grupoId);

    const asignacionesDelGrupo = await this.prisma.client.tutorGrupo.findMany({
      where: { grupoId },
    });
    const tutorIds = asignacionesDelGrupo.map((asignacion) => asignacion.tutorId);

    const tutores = await this.prisma.client.tutor.findMany({
      where: { id: { in: tutorIds } },
      orderBy: { createdAt: 'asc' },
    });

    // grupoIds de cada tutor en una sola query (evita N+1).
    const todasLasAsignaciones = await this.prisma.client.tutorGrupo.findMany({
      where: { tutorId: { in: tutorIds } },
    });

    return tutores.map((tutor) =>
      tutorADto(
        tutor,
        todasLasAsignaciones
          .filter((asignacion) => asignacion.tutorId === tutor.id)
          .map((asignacion) => asignacion.grupoId)
      )
    );
  }

  /**
   * Soft delete (spec): estado=INACTIVO + elimina sus filas TutorGrupo (las
   * asignaciones sí se borran físicamente — son vínculos, no historial).
   */
  async desactivar(tenant: TenantContext, tutorId: string): Promise<void> {
    const tutor = await this.prisma.client.tutor.findFirst({ where: { id: tutorId } });

    if (!tutor || tutor.organizacionId !== tenant.organizacionId) {
      throw new NotFoundException('Tutor no encontrado');
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.tutor.updateMany({
        where: { id: tutorId },
        data: { estado: EstadoCuenta.INACTIVO },
      });
      await tx.tutorGrupo.deleteMany({ where: { tutorId } });
    });
  }
}
