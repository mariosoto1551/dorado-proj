import { Injectable, NotFoundException } from '@nestjs/common';

import { ConductaDto, Rol, TenantContext } from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { conductaADto } from '../comun/mapeadores';
import type { Conducta } from '../generated/prisma/client';
import { EstadoCatalogo, TipoConducta } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CrearConductaRequest,
  EditarConductaRequest,
  ListarConductasQuery,
} from './dto/conductas.dto';

@Injectable()
export class ConductasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoGrupoService
  ) {}

  async crear(
    tenant: TenantContext,
    grupoId: string,
    datos: CrearConductaRequest
  ): Promise<ConductaDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const conducta = await this.prisma.client.conducta.create({
      data: {
        // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
        organizacionId: tenant.organizacionId,
        grupoId,
        nombre: datos.nombre,
        tipo: datos.tipo,
        valorPuntos: datos.valorPuntos,
        // El autoreporte es específico de mala conducta (spec fase-05):
        // en BUENA se fuerza a false, sin error.
        permiteAutoreporte:
          datos.tipo === TipoConducta.BUENA ? false : datos.permiteAutoreporte ?? false,
        creadaPorTutorId: tenant.principalId,
      },
    });

    return conductaADto(conducta);
  }

  async listar(
    tenant: TenantContext,
    grupoId: string,
    query: ListarConductasQuery
  ): Promise<ConductaDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    // USUARIO solo ve ACTIVA y su query param se ignora (spec fase-05).
    const estado =
      tenant.rol === Rol.USUARIO ? EstadoCatalogo.ACTIVA : query.estado;

    const conductas = await this.prisma.client.conducta.findMany({
      where: { grupoId, ...(estado && { estado }) },
      orderBy: { createdAt: 'asc' },
    });

    return conductas.map(conductaADto);
  }

  async editar(
    tenant: TenantContext,
    id: string,
    datos: EditarConductaRequest
  ): Promise<ConductaDto> {
    const existente = await this.buscarAccesible(tenant, id);

    const tipoEfectivo = datos.tipo ?? existente.tipo;
    const permiteEfectivo =
      datos.permiteAutoreporte !== undefined
        ? datos.permiteAutoreporte
        : existente.permiteAutoreporte;

    // updateMany (no update): pasa por el filtro automático de tenant.
    await this.prisma.client.conducta.updateMany({
      where: { id },
      data: {
        ...(datos.nombre !== undefined && { nombre: datos.nombre }),
        tipo: tipoEfectivo,
        ...(datos.valorPuntos !== undefined && { valorPuntos: datos.valorPuntos }),
        permiteAutoreporte:
          tipoEfectivo === TipoConducta.BUENA ? false : permiteEfectivo,
      },
    });

    const actualizada = await this.prisma.client.conducta.findFirst({ where: { id } });

    if (!actualizada) {
      throw new NotFoundException('Conducta no encontrada');
    }

    return conductaADto(actualizada);
  }

  /** Soft delete (spec): ARCHIVADA. No hay reactivación por endpoint. */
  async archivar(tenant: TenantContext, id: string): Promise<ConductaDto> {
    const existente = await this.buscarAccesible(tenant, id);

    await this.prisma.client.conducta.updateMany({
      where: { id },
      data: { estado: EstadoCatalogo.ARCHIVADA },
    });

    return conductaADto({ ...existente, estado: EstadoCatalogo.ARCHIVADA });
  }

  /** Igual criterio que actividades: 404 si no existe, no es del tenant, o es ARCHIVADA para un USUARIO. */
  private async buscarAccesible(tenant: TenantContext, id: string): Promise<Conducta> {
    const conducta = await this.prisma.client.conducta.findFirst({ where: { id } });

    if (
      !conducta ||
      (tenant.rol === Rol.USUARIO && conducta.estado !== EstadoCatalogo.ACTIVA)
    ) {
      throw new NotFoundException('Conducta no encontrada');
    }

    return conducta;
  }
}
