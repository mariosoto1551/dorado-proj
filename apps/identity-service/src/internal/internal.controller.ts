import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';

import { InternalSecretGuard } from '@dorado/shared-auth';
import {
  EquipoInternoDto,
  GrupoDto,
  RolEquipoMiembro,
  TutorDto,
  UsuarioDto,
} from '@dorado/shared-types';

import { grupoADto, tutorADto, usuarioADto } from '../comun/mapeadores';
import { EstadoCuenta, RolTutor } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Endpoints internos servicio-a-servicio (ADR-00 §4): protegidos por
 * `x-internal-secret`, NUNCA expuestos vía Gateway público. Trabajan con IDs
 * explícitos (el llamador interno es confiable) — sin contexto de tenant.
 */
@Controller('internal/identity')
@UseGuards(InternalSecretGuard)
export class InternalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('grupos/:grupoId')
  async grupo(@Param('grupoId') grupoId: string): Promise<GrupoDto> {
    const grupo = await this.prisma.client.grupo.findFirst({ where: { id: grupoId } });

    if (!grupo) {
      throw new NotFoundException('Grupo no encontrado');
    }

    return grupoADto(grupo);
  }

  @Get('grupos/:grupoId/usuarios')
  async usuariosDelGrupo(@Param('grupoId') grupoId: string): Promise<UsuarioDto[]> {
    // Membresía por UsuarioGrupo (fase-14, usuario multi-grupo): incluye a los
    // que se unieron con una cuenta que ya existía en otro grupo. Solo ACTIVO
    // (spec fase-02, tabla de endpoints internos).
    const membresias = await this.prisma.client.usuarioGrupo.findMany({
      where: { grupoId },
      orderBy: { createdAt: 'asc' },
    });

    const usuarios = await this.prisma.client.usuario.findMany({
      where: {
        id: { in: membresias.map((m) => m.usuarioId) },
        estado: EstadoCuenta.ACTIVO,
      },
      orderBy: { createdAt: 'asc' },
    });

    return usuarios.map((u) => usuarioADto(u, grupoId));
  }

  /**
   * Tutores efectivos de un grupo (agregado en fase-09 para las plantillas de
   * notification-service): los asignados vía TutorGrupo MÁS los ORG_ADMIN de
   * la organización, que tienen acceso implícito a todos los grupos (ADR-00
   * §1) y en el caso familiar son los padres. Solo ACTIVO.
   */
  @Get('grupos/:grupoId/tutores')
  async tutoresDelGrupo(@Param('grupoId') grupoId: string): Promise<TutorDto[]> {
    const grupo = await this.prisma.client.grupo.findFirst({ where: { id: grupoId } });

    if (!grupo) {
      throw new NotFoundException('Grupo no encontrado');
    }

    const asignaciones = await this.prisma.client.tutorGrupo.findMany({
      where: { grupoId },
    });

    const tutores = await this.prisma.client.tutor.findMany({
      where: {
        estado: EstadoCuenta.ACTIVO,
        OR: [
          { id: { in: asignaciones.map((asignacion) => asignacion.tutorId) } },
          { organizacionId: grupo.organizacionId, rol: RolTutor.ORG_ADMIN },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    const todasLasAsignaciones = await this.prisma.client.tutorGrupo.findMany({
      where: { tutorId: { in: tutores.map((tutor) => tutor.id) } },
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
   * Membresía y jefe de un Equipo (fase-14-09) — la consumen activity (completar
   * tarea de equipo / reporte del jefe) y scoring. Sin contexto de tenant: el
   * llamador interno es confiable y trabaja con el id explícito.
   */
  @Get('equipos/:equipoId')
  async equipo(@Param('equipoId') equipoId: string): Promise<EquipoInternoDto> {
    const equipo = await this.prisma.client.equipo.findFirst({
      where: { id: equipoId },
      include: { miembros: true },
    });

    if (!equipo) {
      throw new NotFoundException('Equipo no encontrado');
    }

    const jefe = equipo.miembros.find((miembro) => miembro.rol === 'JEFE');

    return {
      equipoId: equipo.id,
      organizacionId: equipo.organizacionId,
      grupoId: equipo.grupoId,
      nombre: equipo.nombre,
      estado: equipo.estado as EquipoInternoDto['estado'],
      jefeUsuarioId: jefe?.usuarioId ?? '',
      miembros: equipo.miembros.map((miembro) => ({
        usuarioId: miembro.usuarioId,
        rol: miembro.rol as RolEquipoMiembro,
      })),
    };
  }

  @Get('usuarios/:id')
  async usuario(@Param('id') id: string): Promise<UsuarioDto> {
    const usuario = await this.prisma.client.usuario.findFirst({ where: { id } });

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return usuarioADto(usuario);
  }

  @Get('tutores/:id')
  async tutor(@Param('id') id: string): Promise<TutorDto> {
    const tutor = await this.prisma.client.tutor.findFirst({ where: { id } });

    if (!tutor) {
      throw new NotFoundException('Tutor no encontrado');
    }

    const asignaciones = await this.prisma.client.tutorGrupo.findMany({
      where: { tutorId: id },
    });

    return tutorADto(tutor, asignaciones.map((asignacion) => asignacion.grupoId));
  }
}
