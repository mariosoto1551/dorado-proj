import { Injectable } from '@nestjs/common';

import {
  EquipoDto,
  EquipoMiembroDto,
  MiEquipoDto,
  PrincipalType,
  RolEquipoMiembro,
  TenantContext,
} from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  EquipoNoEncontradoException,
  JefeNoEsMiembroException,
  NoSePuedeQuitarJefeException,
  UsuarioNoEnGrupoException,
  UsuarioYaEnEquipoException,
} from '../comun/excepciones';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { EstadoCuenta, RolEquipoMiembro as RolEquipoMiembroPrisma } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AgregarMiembroEquipoRequest,
  CrearEquipoRequest,
  EditarEquipoRequest,
  SustituirJefeEquipoRequest,
} from './dto/equipos.dto';

type EquipoConMiembros = {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  estado: string;
  createdAt: Date;
  miembros: Array<{ usuarioId: string; rol: string; createdAt: Date }>;
};

@Injectable()
export class EquiposService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accesoGrupo: AccesoGrupoService,
    private readonly eventos: EventosPublisherService
  ) {}

  async listar(tenant: TenantContext, grupoId: string): Promise<EquipoDto[]> {
    await this.accesoGrupo.asegurarAcceso(tenant, grupoId);

    const equipos = await this.prisma.client.equipo.findMany({
      where: { grupoId },
      orderBy: { createdAt: 'asc' },
      include: { miembros: true },
    });

    return Promise.all(equipos.map((equipo) => this.construirDto(equipo)));
  }

  async detalle(tenant: TenantContext, equipoId: string): Promise<EquipoDto> {
    const equipo = await this.cargarEquipo(equipoId);

    await this.accesoGrupo.asegurarAcceso(tenant, equipo.grupoId);

    return await this.construirDto(equipo);
  }

  async crear(
    tenant: TenantContext,
    grupoId: string,
    datos: CrearEquipoRequest
  ): Promise<EquipoDto> {
    await this.accesoGrupo.asegurarAcceso(tenant, grupoId);

    // El jefe no se duplica si vino también en miembrosIds.
    const miembrosNoJefe = datos.miembrosIds.filter((id) => id !== datos.jefeUsuarioId);
    const todos = [datos.jefeUsuarioId, ...miembrosNoJefe];

    await this.asegurarUsuariosDelGrupo(grupoId, todos);
    await this.asegurarNingunoEnOtroEquipo(grupoId, todos);

    const equipo = await this.prisma.client.$transaction(async (tx) => {
      const nuevo = await tx.equipo.create({
        data: {
          organizacionId: tenant.organizacionId,
          grupoId,
          nombre: datos.nombre,
        },
      });

      await tx.equipoMiembro.createMany({
        data: todos.map((usuarioId) => ({
          organizacionId: tenant.organizacionId,
          grupoId,
          equipoId: nuevo.id,
          usuarioId,
          rol:
            usuarioId === datos.jefeUsuarioId
              ? RolEquipoMiembroPrisma.JEFE
              : RolEquipoMiembroPrisma.MIEMBRO,
        })),
      });

      return nuevo;
    });

    await this.publicarAccion(tenant, grupoId, 'EQUIPO_CREADO', equipo.id, {
      nombre: datos.nombre,
      jefeUsuarioId: datos.jefeUsuarioId,
      miembros: todos.length,
    });

    return await this.detalleInterno(equipo.id);
  }

  async editar(
    tenant: TenantContext,
    equipoId: string,
    datos: EditarEquipoRequest
  ): Promise<EquipoDto> {
    const equipo = await this.cargarEquipo(equipoId);

    await this.accesoGrupo.asegurarAcceso(tenant, equipo.grupoId);

    await this.prisma.client.equipo.updateMany({
      where: { id: equipoId },
      data: {
        ...(datos.nombre !== undefined && { nombre: datos.nombre }),
        ...(datos.estado !== undefined && { estado: datos.estado as EstadoCuenta }),
      },
    });

    await this.publicarAccion(tenant, equipo.grupoId, 'EQUIPO_EDITADO', equipoId, { ...datos });

    return await this.detalleInterno(equipoId);
  }

  async agregarMiembro(
    tenant: TenantContext,
    equipoId: string,
    datos: AgregarMiembroEquipoRequest
  ): Promise<EquipoDto> {
    const equipo = await this.cargarEquipo(equipoId);

    await this.accesoGrupo.asegurarAcceso(tenant, equipo.grupoId);
    await this.asegurarUsuariosDelGrupo(equipo.grupoId, [datos.usuarioId]);
    await this.asegurarNingunoEnOtroEquipo(equipo.grupoId, [datos.usuarioId]);

    await this.prisma.client.equipoMiembro.create({
      data: {
        organizacionId: tenant.organizacionId,
        grupoId: equipo.grupoId,
        equipoId,
        usuarioId: datos.usuarioId,
        rol: RolEquipoMiembroPrisma.MIEMBRO,
      },
    });

    await this.publicarAccion(tenant, equipo.grupoId, 'EQUIPO_MIEMBRO_AGREGADO', equipoId, {
      usuarioId: datos.usuarioId,
    });

    return await this.detalleInterno(equipoId);
  }

  async quitarMiembro(
    tenant: TenantContext,
    equipoId: string,
    usuarioId: string
  ): Promise<EquipoDto> {
    const equipo = await this.cargarEquipo(equipoId);

    await this.accesoGrupo.asegurarAcceso(tenant, equipo.grupoId);

    const miembro = equipo.miembros.find((m) => m.usuarioId === usuarioId);

    if (!miembro) {
      throw new UsuarioNoEnGrupoException();
    }

    if (miembro.rol === RolEquipoMiembroPrisma.JEFE) {
      throw new NoSePuedeQuitarJefeException();
    }

    await this.prisma.client.equipoMiembro.deleteMany({
      where: { equipoId, usuarioId },
    });

    await this.publicarAccion(tenant, equipo.grupoId, 'EQUIPO_MIEMBRO_QUITADO', equipoId, {
      usuarioId,
    });

    return await this.detalleInterno(equipoId);
  }

  async sustituirJefe(
    tenant: TenantContext,
    equipoId: string,
    datos: SustituirJefeEquipoRequest
  ): Promise<EquipoDto> {
    const equipo = await this.cargarEquipo(equipoId);

    await this.accesoGrupo.asegurarAcceso(tenant, equipo.grupoId);

    const nuevoJefe = equipo.miembros.find((m) => m.usuarioId === datos.nuevoJefeUsuarioId);

    if (!nuevoJefe) {
      throw new JefeNoEsMiembroException();
    }

    const jefeActual = equipo.miembros.find((m) => m.rol === RolEquipoMiembroPrisma.JEFE);

    // Degradar al jefe actual y promover al nuevo en una transacción: el
    // invariante "un solo JEFE por equipo" no admite estado intermedio.
    await this.prisma.client.$transaction(async (tx) => {
      if (jefeActual && jefeActual.usuarioId !== datos.nuevoJefeUsuarioId) {
        await tx.equipoMiembro.updateMany({
          where: { equipoId, usuarioId: jefeActual.usuarioId },
          data: { rol: RolEquipoMiembroPrisma.MIEMBRO },
        });
      }

      await tx.equipoMiembro.updateMany({
        where: { equipoId, usuarioId: datos.nuevoJefeUsuarioId },
        data: { rol: RolEquipoMiembroPrisma.JEFE },
      });
    });

    await this.publicarAccion(tenant, equipo.grupoId, 'EQUIPO_JEFE_SUSTITUIDO', equipoId, {
      jefeAnterior: jefeActual?.usuarioId ?? null,
      jefeNuevo: datos.nuevoJefeUsuarioId,
    });

    return await this.detalleInterno(equipoId);
  }

  /**
   * Equipos del participante autenticado (uno por grupo). Alimenta la vista
   * "Mi equipo" — marca `esJefe` para habilitar completar tarea / reportar.
   */
  async misEquipos(tenant: TenantContext): Promise<MiEquipoDto[]> {
    if (tenant.principalType !== PrincipalType.USUARIO) {
      return [];
    }

    const membresias = await this.prisma.client.equipoMiembro.findMany({
      where: { usuarioId: tenant.principalId },
    });

    const equipos = await this.prisma.client.equipo.findMany({
      where: {
        id: { in: membresias.map((m) => m.equipoId) },
        estado: EstadoCuenta.ACTIVO,
      },
      orderBy: { createdAt: 'asc' },
      include: { miembros: true },
    });

    return Promise.all(
      equipos.map(async (equipo) => {
        const dto = await this.construirDto(equipo);
        const esJefe = dto.jefeUsuarioId === tenant.principalId;

        return { ...dto, esJefe };
      })
    );
  }

  // --- helpers ---

  private async cargarEquipo(equipoId: string): Promise<EquipoConMiembros> {
    const equipo = await this.prisma.client.equipo.findFirst({
      where: { id: equipoId },
      include: { miembros: true },
    });

    if (!equipo) {
      throw new EquipoNoEncontradoException();
    }

    return equipo;
  }

  private async detalleInterno(equipoId: string): Promise<EquipoDto> {
    const equipo = await this.cargarEquipo(equipoId);

    return await this.construirDto(equipo);
  }

  private async construirDto(equipo: EquipoConMiembros): Promise<EquipoDto> {
    const usuarioIds = equipo.miembros.map((m) => m.usuarioId);

    const [usuarios, membresias] = await Promise.all([
      this.prisma.client.usuario.findMany({ where: { id: { in: usuarioIds } } }),
      // fase-14-19: el rol funcional de cada uno EN ESTE grupo, para el chip
      // junto al nombre (decisión 5: el rol es visible para todo el grupo).
      this.prisma.client.usuarioGrupo.findMany({
        where: { grupoId: equipo.grupoId, usuarioId: { in: usuarioIds } },
        include: { rolGrupo: true },
      }),
    ]);

    const porId = new Map(usuarios.map((u) => [u.id, u]));
    const rolPorUsuario = new Map(
      membresias.map((membresia) => [
        membresia.usuarioId,
        membresia.rolGrupo
          ? {
              id: membresia.rolGrupo.id,
              nombre: membresia.rolGrupo.nombre,
              colorHex: membresia.rolGrupo.colorHex,
            }
          : null,
      ])
    );

    const miembros: EquipoMiembroDto[] = equipo.miembros
      // Jefe primero, luego por antigüedad de la membresía.
      .slice()
      .sort((a, b) => {
        if (a.rol !== b.rol) {
          return a.rol === RolEquipoMiembroPrisma.JEFE ? -1 : 1;
        }

        return a.createdAt.getTime() - b.createdAt.getTime();
      })
      .map((m) => {
        const usuario = porId.get(m.usuarioId);

        return {
          usuarioId: m.usuarioId,
          nombre: usuario?.nombre ?? '',
          avatarId: usuario?.avatarId ?? '',
          rol: m.rol as RolEquipoMiembro,
          rolGrupo: rolPorUsuario.get(m.usuarioId) ?? null,
        };
      });

    const jefe = equipo.miembros.find((m) => m.rol === RolEquipoMiembroPrisma.JEFE);

    return {
      id: equipo.id,
      organizacionId: equipo.organizacionId,
      grupoId: equipo.grupoId,
      nombre: equipo.nombre,
      estado: equipo.estado as EquipoDto['estado'],
      jefeUsuarioId: jefe?.usuarioId ?? '',
      miembros,
      createdAt: equipo.createdAt.toISOString(),
    };
  }

  private async asegurarUsuariosDelGrupo(grupoId: string, usuarioIds: string[]): Promise<void> {
    if (usuarioIds.length === 0) {
      return;
    }

    const membresias = await this.prisma.client.usuarioGrupo.findMany({
      where: { grupoId, usuarioId: { in: usuarioIds } },
    });
    const presentes = new Set(membresias.map((m) => m.usuarioId));

    if (usuarioIds.some((id) => !presentes.has(id))) {
      throw new UsuarioNoEnGrupoException();
    }
  }

  private async asegurarNingunoEnOtroEquipo(
    grupoId: string,
    usuarioIds: string[]
  ): Promise<void> {
    const yaEn = await this.prisma.client.equipoMiembro.findFirst({
      where: { grupoId, usuarioId: { in: usuarioIds } },
    });

    if (yaEn) {
      throw new UsuarioYaEnEquipoException();
    }
  }

  private async publicarAccion(
    tenant: TenantContext,
    grupoId: string,
    accion: string,
    equipoId: string,
    detalle: Record<string, unknown>
  ): Promise<void> {
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion,
      entidadTipo: 'Equipo',
      entidadId: equipoId,
      detalle,
    });
  }
}
