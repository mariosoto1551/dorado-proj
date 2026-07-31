import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';

import { InternalSecretGuard } from '@dorado/shared-auth';
import {
  EquipoInternoDto,
  GrupoDto,
  RolAsignadoDto,
  RolEquipoMiembro,
  RolGrupoInternoDto,
  TutorDto,
  UsuarioDto,
} from '@dorado/shared-types';

import { grupoADto, tutorADto, usuarioADto } from '../comun/mapeadores';
import type { Equipo, EquipoMiembro } from '../generated/prisma/client';
import { EstadoCuenta, RolTutor } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/** Equipo + membresía al DTO interno. Compartido por el detalle y el listado. */
function equipoInternoADto(equipo: Equipo & { miembros: EquipoMiembro[] }): EquipoInternoDto {
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

    return equipoInternoADto(equipo);
  }

  /**
   * Equipos de un Grupo con su membresía (fase-14-18). Lo consume el historial
   * de la sesión de activity para resolver el NOMBRE del equipo de una tarea
   * colectiva sin hacer una llamada por fila: una sola por request, siempre.
   * Incluye los INACTIVO (archivados) a propósito: una tarea vieja de un equipo
   * archivado igual tiene que mostrar su nombre en el historial.
   */
  @Get('grupos/:grupoId/equipos')
  async equiposDelGrupo(@Param('grupoId') grupoId: string): Promise<EquipoInternoDto[]> {
    const equipos = await this.prisma.client.equipo.findMany({
      where: { grupoId },
      include: { miembros: true },
      orderBy: { createdAt: 'asc' },
    });

    return equipos.map((equipo) => equipoInternoADto(equipo));
  }

  /**
   * Catálogo de roles del grupo (fase-14-19). Lo consume activity para validar
   * `Actividad.rolesPermitidos` al crear/editar — escritura del catálogo, que es
   * fría. Incluye los archivados a propósito: un registro viejo igual tiene que
   * poder mostrar el nombre del rol al que estuvo restringido.
   */
  @Get('grupos/:grupoId/roles')
  async rolesDelGrupo(@Param('grupoId') grupoId: string): Promise<RolGrupoInternoDto[]> {
    const roles = await this.prisma.client.rolGrupo.findMany({
      where: { grupoId },
      orderBy: { createdAt: 'asc' },
    });

    return roles.map((rol) => ({
      id: rol.id,
      organizacionId: rol.organizacionId,
      grupoId: rol.grupoId,
      nombre: rol.nombre,
      colorHex: rol.colorHex,
      estado: rol.estado as RolGrupoInternoDto['estado'],
    }));
  }

  /**
   * Quién tiene qué rol en el grupo (fase-14-19). Es el que entra al CAMINO
   * CALIENTE de activity (`mi-estado-hoy`, plan del día, registro y el castigo
   * al cerrar la sesión), así que devuelve el payload más chico posible: dos ids
   * por participante, una llamada por request, nunca una por fila.
   *
   * Solo participantes ACTIVO, igual que `usuariosDelGrupo`.
   */
  @Get('grupos/:grupoId/roles-asignados')
  async rolesAsignados(@Param('grupoId') grupoId: string): Promise<RolAsignadoDto[]> {
    const membresias = await this.prisma.client.usuarioGrupo.findMany({
      where: { grupoId },
      orderBy: { createdAt: 'asc' },
    });

    const activos = await this.prisma.client.usuario.findMany({
      where: {
        id: { in: membresias.map((membresia) => membresia.usuarioId) },
        estado: EstadoCuenta.ACTIVO,
      },
      select: { id: true },
    });
    const idsActivos = new Set(activos.map((usuario) => usuario.id));

    return membresias
      .filter((membresia) => idsActivos.has(membresia.usuarioId))
      .map((membresia) => ({
        usuarioId: membresia.usuarioId,
        rolGrupoId: membresia.rolGrupoId,
      }));
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
