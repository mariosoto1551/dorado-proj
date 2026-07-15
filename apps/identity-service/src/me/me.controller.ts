import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';

import {
  CurrentTenant,
  RolesGuard,
  TenantContextGuard,
} from '@dorado/shared-auth';
import {
  PrincipalType,
  TenantContext,
  TutorDto,
  UsuarioDto,
} from '@dorado/shared-types';

import { tutorADto, usuarioADto } from '../comun/mapeadores';
import { PrismaService } from '../prisma/prisma.service';

// GET /identity/me — perfil del principal actual, cualquier rol (spec fase-02).
@Controller('identity')
@UseGuards(TenantContextGuard, RolesGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentTenant() tenant: TenantContext): Promise<TutorDto | UsuarioDto> {
    if (tenant.principalType === PrincipalType.USUARIO) {
      const usuario = await this.prisma.client.usuario.findFirst({
        where: { id: tenant.principalId },
      });

      if (!usuario) {
        throw new NotFoundException('Usuario no encontrado');
      }

      return usuarioADto(usuario);
    }

    const tutor = await this.prisma.client.tutor.findFirst({
      where: { id: tenant.principalId },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor no encontrado');
    }

    const asignaciones = await this.prisma.client.tutorGrupo.findMany({
      where: { tutorId: tutor.id },
    });

    return tutorADto(tutor, asignaciones.map((asignacion) => asignacion.grupoId));
  }
}
