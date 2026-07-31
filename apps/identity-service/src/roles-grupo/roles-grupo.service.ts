import { Injectable } from '@nestjs/common';

import { PrincipalType, RolGrupoDto, TenantContext } from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  RolGrupoDuplicadoException,
  RolGrupoInexistenteException,
  RolGrupoNoEncontradoException,
  UsuarioNoEsDelGrupoException,
} from '../comun/excepciones';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { EstadoCuenta } from '../generated/prisma/enums';
import type { RolGrupo } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ActualizarRolGrupoRequest,
  AsignarRolGrupoRequest,
  CrearRolGrupoRequest,
} from './dto/roles-grupo.dto';

/** Normalización para el chequeo de duplicados: "  Cocina " y "cocina" chocan. */
function normalizar(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/**
 * Catálogo de roles de un Grupo y su asignación a participantes (fase-14-19).
 *
 * El rol es POR GRUPO (decisión 1): el mismo participante puede tener rol en un
 * grupo y ninguno en otro. La asignación es un campo de `UsuarioGrupo`, no una
 * tabla aparte — con un solo rol por participante (decisión 2) el invariante lo
 * garantiza el esquema (decisión 9 de la spec).
 */
@Injectable()
export class RolesGrupoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accesoGrupo: AccesoGrupoService,
    private readonly eventos: EventosPublisherService
  ) {}

  /**
   * Catálogo del grupo para el TUTOR/ORG_ADMIN: incluye `cantidadAsignados` y,
   * si se pide, los archivados (la pantalla de gestión los necesita para poder
   * desarchivarlos).
   */
  async listar(
    tenant: TenantContext,
    grupoId: string,
    incluirArchivados: boolean
  ): Promise<RolGrupoDto[]> {
    await this.accesoGrupo.asegurarAcceso(tenant, grupoId);

    const roles = await this.prisma.client.rolGrupo.findMany({
      where: {
        grupoId,
        ...(incluirArchivados ? {} : { estado: EstadoCuenta.ACTIVO }),
      },
      orderBy: { createdAt: 'asc' },
    });

    const asignados = await this.prisma.client.usuarioGrupo.groupBy({
      by: ['rolGrupoId'],
      where: { grupoId, rolGrupoId: { in: roles.map((rol) => rol.id) } },
      _count: { _all: true },
    });
    const cantidadPorRol = new Map(
      asignados.map((fila) => [fila.rolGrupoId, fila._count._all])
    );

    return roles.map((rol) => this.aDto(rol, cantidadPorRol.get(rol.id) ?? 0));
  }

  /**
   * Catálogo visto por un participante del grupo (decisión 5: el rol es visible
   * para todos dentro del grupo). Solo los ACTIVO y sin `cantidadAsignados` —
   * el conteo es información de gestión, no de la app del integrante.
   */
  async listarParaParticipante(
    tenant: TenantContext,
    grupoId: string
  ): Promise<RolGrupoDto[]> {
    await this.asegurarMiembroDelGrupo(tenant, grupoId);

    const roles = await this.prisma.client.rolGrupo.findMany({
      where: { grupoId, estado: EstadoCuenta.ACTIVO },
      orderBy: { createdAt: 'asc' },
    });

    return roles.map((rol) => this.aDto(rol));
  }

  async crear(
    tenant: TenantContext,
    grupoId: string,
    datos: CrearRolGrupoRequest
  ): Promise<RolGrupoDto> {
    await this.accesoGrupo.asegurarAcceso(tenant, grupoId);
    await this.asegurarNombreLibre(grupoId, datos.nombre);

    const rol = await this.prisma.client.rolGrupo.create({
      data: {
        organizacionId: tenant.organizacionId,
        grupoId,
        nombre: datos.nombre.trim(),
        colorHex: datos.colorHex.toUpperCase(),
      },
    });

    await this.publicarAccion(tenant, grupoId, 'ROL_GRUPO_CREADO', rol.id, {
      nombre: rol.nombre,
      colorHex: rol.colorHex,
    });

    return this.aDto(rol, 0);
  }

  /**
   * Renombrar / recolorear / archivar. **Archivar desasigna** a todos los
   * participantes que lo tenían (decisión 12): las actividades restringidas a
   * él quedan sin nadie que las vea, y el catálogo del Tutor lo avisa. Se eligió
   * esto en vez de bloquear el archivado con un 409 porque identity no puede
   * preguntarle a activity si el rol está en uso sin invertir la dirección de
   * las llamadas internas (hoy activity→identity, nunca al revés).
   */
  async actualizar(
    tenant: TenantContext,
    rolGrupoId: string,
    datos: ActualizarRolGrupoRequest
  ): Promise<RolGrupoDto> {
    const rol = await this.cargarRol(rolGrupoId);

    await this.accesoGrupo.asegurarAcceso(tenant, rol.grupoId);

    if (datos.nombre !== undefined) {
      await this.asegurarNombreLibre(rol.grupoId, datos.nombre, rolGrupoId);
    }

    const seArchiva = datos.estado === 'INACTIVO' && rol.estado !== EstadoCuenta.INACTIVO;

    const actualizado = await this.prisma.client.$transaction(async (tx) => {
      const fila = await tx.rolGrupo.update({
        where: { id: rolGrupoId },
        data: {
          ...(datos.nombre !== undefined && { nombre: datos.nombre.trim() }),
          ...(datos.colorHex !== undefined && { colorHex: datos.colorHex.toUpperCase() }),
          ...(datos.estado !== undefined && { estado: datos.estado as EstadoCuenta }),
        },
      });

      if (seArchiva) {
        await tx.usuarioGrupo.updateMany({
          where: { grupoId: rol.grupoId, rolGrupoId },
          data: { rolGrupoId: null },
        });
      }

      return fila;
    });

    await this.publicarAccion(
      tenant,
      rol.grupoId,
      seArchiva ? 'ROL_GRUPO_ARCHIVADO' : 'ROL_GRUPO_ACTUALIZADO',
      rolGrupoId,
      { ...datos }
    );

    const cantidad = seArchiva ? 0 : await this.contarAsignados(rol.grupoId, rolGrupoId);

    return this.aDto(actualizado, cantidad);
  }

  /**
   * Asignar / cambiar / quitar el rol de un participante. Un solo `PUT` para las
   * tres cosas: con un rol por participante la operación es "fijar el valor", y
   * así queda idempotente y sin estados intermedios. `rolGrupoId: null` quita.
   *
   * No toca nada de lo ya registrado (decisión 15): el ledger y los registros
   * son inmutables, el rol filtra desde ahora y no retroactivamente.
   */
  async asignar(
    tenant: TenantContext,
    grupoId: string,
    usuarioId: string,
    datos: AsignarRolGrupoRequest
  ): Promise<RolGrupoDto | null> {
    await this.accesoGrupo.asegurarAcceso(tenant, grupoId);

    const membresia = await this.prisma.client.usuarioGrupo.findFirst({
      where: { grupoId, usuarioId },
    });

    if (!membresia) {
      throw new UsuarioNoEsDelGrupoException();
    }

    let rol: RolGrupo | null = null;

    if (datos.rolGrupoId !== null) {
      // ACTIVO y de ESTE grupo: asignar el rol de otro grupo sería cruzar
      // tenants por la puerta de atrás (regla 3).
      rol = await this.prisma.client.rolGrupo.findFirst({
        where: { id: datos.rolGrupoId, grupoId, estado: EstadoCuenta.ACTIVO },
      });

      if (!rol) {
        throw new RolGrupoInexistenteException();
      }
    }

    await this.prisma.client.usuarioGrupo.update({
      where: { id: membresia.id },
      data: { rolGrupoId: datos.rolGrupoId },
    });

    await this.publicarAccion(tenant, grupoId, 'ROL_PARTICIPANTE_ASIGNADO', usuarioId, {
      usuarioId,
      rolGrupoId: datos.rolGrupoId,
      rolAnteriorId: membresia.rolGrupoId,
    });

    return rol ? this.aDto(rol) : null;
  }

  // --- helpers ---

  private aDto(rol: RolGrupo, cantidadAsignados?: number): RolGrupoDto {
    return {
      id: rol.id,
      grupoId: rol.grupoId,
      nombre: rol.nombre,
      colorHex: rol.colorHex,
      estado: rol.estado as RolGrupoDto['estado'],
      ...(cantidadAsignados !== undefined && { cantidadAsignados }),
      createdAt: rol.createdAt.toISOString(),
    };
  }

  private async cargarRol(rolGrupoId: string): Promise<RolGrupo> {
    const rol = await this.prisma.client.rolGrupo.findFirst({ where: { id: rolGrupoId } });

    if (!rol) {
      throw new RolGrupoNoEncontradoException();
    }

    return rol;
  }

  private async contarAsignados(grupoId: string, rolGrupoId: string): Promise<number> {
    return await this.prisma.client.usuarioGrupo.count({
      where: { grupoId, rolGrupoId },
    });
  }

  /**
   * El `@@unique([grupoId, nombre])` del schema es la red de seguridad; esto es
   * el chequeo real, porque Postgres compara con distinción de mayúsculas y
   * "Cocina"/"cocina" pasarían el unique sin problema.
   */
  private async asegurarNombreLibre(
    grupoId: string,
    nombre: string,
    exceptoRolId?: string
  ): Promise<void> {
    const existentes = await this.prisma.client.rolGrupo.findMany({
      where: { grupoId, ...(exceptoRolId && { id: { not: exceptoRolId } }) },
      select: { nombre: true },
    });

    if (existentes.some((rol) => normalizar(rol.nombre) === normalizar(nombre))) {
      throw new RolGrupoDuplicadoException();
    }
  }

  private async asegurarMiembroDelGrupo(
    tenant: TenantContext,
    grupoId: string
  ): Promise<void> {
    // Para un TUTOR/ORG_ADMIN que llegue por esta ruta vale la regla de siempre.
    if (tenant.principalType !== PrincipalType.USUARIO) {
      await this.accesoGrupo.asegurarAcceso(tenant, grupoId);

      return;
    }

    const membresia = await this.prisma.client.usuarioGrupo.findFirst({
      where: { grupoId, usuarioId: tenant.principalId },
    });

    if (!membresia) {
      throw new UsuarioNoEsDelGrupoException();
    }
  }

  private async publicarAccion(
    tenant: TenantContext,
    grupoId: string,
    accion: string,
    entidadId: string,
    detalle: Record<string, unknown>
  ): Promise<void> {
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion,
      entidadTipo: 'RolGrupo',
      entidadId,
      detalle,
    });
  }
}
