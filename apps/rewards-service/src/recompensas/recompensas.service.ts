import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { RecompensaDto, Rol, TenantContext } from '@dorado/shared-types';

import { ScoringClientService } from '../clientes/scoring-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { recompensaADto } from '../comun/mapeadores';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Recompensa } from '../generated/prisma/client';
import { EstadoCatalogo } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CrearRecompensaRequest,
  EditarRecompensaRequest,
  ListarRecompensasQuery,
} from './dto/recompensas.dto';

/**
 * Catálogo de recompensas por zona (spec fase-08). `umbralZonaId` referencia
 * a scoring SOLO por ID (regla 2 de CLAUDE.md): se valida por REST interno al
 * crear/editar y se copia `nombreZonaSnapshot` para no depender de una llamada
 * en cada lectura.
 */
@Injectable()
export class RecompensasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringClientService,
    private readonly acceso: AccesoGrupoService,
    private readonly eventos: EventosPublisherService
  ) {}

  async crear(
    tenant: TenantContext,
    grupoId: string,
    datos: CrearRecompensaRequest
  ): Promise<RecompensaDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const nombreZona = await this.validarUmbral(datos.umbralZonaId, grupoId);

    const recompensa = await this.prisma.client.recompensa.create({
      data: {
        // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
        organizacionId: tenant.organizacionId,
        grupoId,
        umbralZonaId: datos.umbralZonaId,
        nombreZonaSnapshot: nombreZona,
        nombre: datos.nombre,
        descripcion: datos.descripcion ?? null,
        imagenUrl: datos.imagenUrl ?? null,
        permiteSeleccion: datos.permiteSeleccion ?? false,
        permiteAzar: datos.permiteAzar ?? false,
        creadaPorTutorId: tenant.principalId,
      },
    });

    // Retrofit fase-09: rastro de auditoría de toda escritura administrativa.
    await this.publicarAuditoria(tenant, 'RECOMPENSA_CREADA', recompensa, {
      despues: recompensaADto(recompensa),
    });

    return recompensaADto(recompensa);
  }

  async listar(
    tenant: TenantContext,
    grupoId: string,
    query: ListarRecompensasQuery
  ): Promise<RecompensaDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    // USUARIO solo ve ACTIVA y su query param se ignora (criterio fase-05).
    const estado =
      tenant.rol === Rol.USUARIO ? EstadoCatalogo.ACTIVA : query.estado;

    const recompensas = await this.prisma.client.recompensa.findMany({
      // El filtro organizacionId (+ grupoId IN grupoIds) lo agrega la tenant
      // extension; grupoId acá acota al grupo pedido dentro de los accesibles.
      where: {
        grupoId,
        ...(query.umbralZonaId && { umbralZonaId: query.umbralZonaId }),
        ...(estado && { estado }),
      },
      orderBy: { createdAt: 'asc' },
    });

    return recompensas.map(recompensaADto);
  }

  async editar(
    tenant: TenantContext,
    id: string,
    datos: EditarRecompensaRequest
  ): Promise<RecompensaDto> {
    const existente = await this.buscarAccesible(id);

    // Si cambia la zona, se revalida contra scoring y se re-copia el snapshot
    // del nombre (comentario del modelo en la spec: "al crear/editar").
    const cambiaZona =
      datos.umbralZonaId !== undefined && datos.umbralZonaId !== existente.umbralZonaId;
    const nombreZonaSnapshot = cambiaZona
      ? await this.validarUmbral(datos.umbralZonaId as string, existente.grupoId)
      : existente.nombreZonaSnapshot;

    await this.prisma.client.recompensa.updateMany({
      where: { id },
      data: {
        ...(datos.umbralZonaId !== undefined && { umbralZonaId: datos.umbralZonaId }),
        nombreZonaSnapshot,
        ...(datos.nombre !== undefined && { nombre: datos.nombre }),
        ...(datos.descripcion !== undefined && { descripcion: datos.descripcion }),
        ...(datos.imagenUrl !== undefined && { imagenUrl: datos.imagenUrl }),
        ...(datos.permiteSeleccion !== undefined && { permiteSeleccion: datos.permiteSeleccion }),
        ...(datos.permiteAzar !== undefined && { permiteAzar: datos.permiteAzar }),
      },
    });

    const actualizada = await this.prisma.client.recompensa.findFirst({ where: { id } });

    if (!actualizada) {
      throw new NotFoundException('Recompensa no encontrada');
    }

    await this.publicarAuditoria(tenant, 'RECOMPENSA_EDITADA', actualizada, {
      antes: recompensaADto(existente),
      despues: recompensaADto(actualizada),
    });

    return recompensaADto(actualizada);
  }

  /** Soft delete (spec): ARCHIVADA. No hay reactivación por endpoint. */
  async archivar(tenant: TenantContext, id: string): Promise<RecompensaDto> {
    const existente = await this.buscarAccesible(id);

    await this.prisma.client.recompensa.updateMany({
      where: { id },
      data: { estado: EstadoCatalogo.ARCHIVADA },
    });

    await this.publicarAuditoria(tenant, 'RECOMPENSA_ARCHIVADA', existente, {
      antes: recompensaADto(existente),
    });

    return recompensaADto({ ...existente, estado: EstadoCatalogo.ARCHIVADA });
  }

  /** Retrofit fase-09: evento genérico de auditoría (consumido por Audit). */
  private async publicarAuditoria(
    tenant: TenantContext,
    accion: string,
    recompensa: Recompensa,
    detalle: Record<string, unknown>
  ): Promise<void> {
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId: recompensa.grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion,
      entidadTipo: 'Recompensa',
      entidadId: recompensa.id,
      detalle,
    });
  }

  /**
   * Umbral real y del MISMO grupo (spec: si no existe o no pertenece, 400).
   * Devuelve el nombre de zona para el snapshot.
   */
  private async validarUmbral(umbralZonaId: string, grupoId: string): Promise<string> {
    const umbral = await this.scoring.obtenerUmbral(umbralZonaId);

    if (!umbral || umbral.grupoId !== grupoId) {
      throw new BadRequestException(
        'umbralZonaId no corresponde a una zona de este grupo'
      );
    }

    return umbral.nombreZona;
  }

  /**
   * Fila accesible para el tenant (el filtro automático agrega organizacionId
   * y, para TUTOR/USUARIO, grupoId IN grupoIds) — 404 si no existe o no es suya.
   */
  private async buscarAccesible(id: string): Promise<Recompensa> {
    const recompensa = await this.prisma.client.recompensa.findFirst({ where: { id } });

    if (!recompensa) {
      throw new NotFoundException('Recompensa no encontrada');
    }

    return recompensa;
  }
}
