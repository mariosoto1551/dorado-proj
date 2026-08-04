import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import {
  EtiquetaCatalogoDto,
  ModoRecompensas,
  RecompensaDto,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { ScoringClientService } from '../clientes/scoring-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { recompensaADto } from '../comun/mapeadores';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { EtiquetasService } from '../etiquetas/etiquetas.service';
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
 * Catálogo de ítems (spec fase-08, extendido por fase-14-22). `umbralZonaId`
 * referencia a scoring SOLO por ID (regla 2 de CLAUDE.md): se valida por REST
 * interno al crear/editar y se copia `nombreZonaSnapshot` para no depender de
 * una llamada en cada lectura.
 *
 * fase-14-22 decisión 13: la zona es **obligatoria solo en modo DIRECTO**. En
 * TIENDA un ítem no está atado a ninguna zona — el producto de la tienda
 * decide cómo se obtiene, no el ítem.
 */
@Injectable()
export class RecompensasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringClientService,
    private readonly acceso: AccesoGrupoService,
    private readonly eventos: EventosPublisherService,
    private readonly configuracion: ConfiguracionService,
    private readonly etiquetas: EtiquetasService
  ) {}

  async crear(
    tenant: TenantContext,
    grupoId: string,
    datos: CrearRecompensaRequest
  ): Promise<RecompensaDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const zona = await this.resolverZona(grupoId, datos.umbralZonaId);

    const recompensa = await this.prisma.client.recompensa.create({
      data: {
        // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
        organizacionId: tenant.organizacionId,
        grupoId,
        tipo: datos.tipo ?? 'PREMIO',
        umbralZonaId: zona.umbralZonaId,
        nombreZonaSnapshot: zona.nombreZonaSnapshot,
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
    const esParticipante = tenant.rol === Rol.USUARIO;
    const estado = esParticipante ? EstadoCatalogo.ACTIVA : query.estado;

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

    // fase-14-26 decisión 12: el participante no ve etiquetas por ningún
    // camino, y este es el mismo DTO que recibe en los elegibles del modo
    // DIRECTO. Cortar acá también le ahorra las dos consultas del mapa.
    if (esParticipante) {
      return recompensas.map((recompensa) => recompensaADto(recompensa));
    }

    const porRecompensa = await this.etiquetas.mapaPorRecompensa(grupoId);
    const conEtiquetas = recompensas.map((recompensa) =>
      recompensaADto(recompensa, porRecompensa.get(recompensa.id) ?? [])
    );

    // El filtro por etiqueta se resuelve sobre el mapa ya cargado en vez de con
    // un `where` anidado: la alternativa era una consulta más para traer los
    // ids, y acá el grupo entero ya está en memoria (decisión 9: una etiqueta
    // por vez, así que no hay que decidir entre unión e intersección).
    if (!query.etiquetaId) {
      return conEtiquetas;
    }

    return conEtiquetas.filter((recompensa) =>
      recompensa.etiquetas.some((etiqueta) => etiqueta.id === query.etiquetaId)
    );
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
        ...(datos.tipo !== undefined && { tipo: datos.tipo }),
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

    return recompensaADto(actualizada, await this.etiquetasDe(actualizada));
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

    return recompensaADto(
      { ...existente, estado: EstadoCatalogo.ARCHIVADA },
      await this.etiquetasDe(existente)
    );
  }

  /**
   * Etiquetas de UN ítem, para que la respuesta de una escritura no diga «sin
   * etiquetas» cuando las tiene. Solo en escrituras: en la lista se usa el mapa
   * del grupo, que resuelve todo el catálogo con las mismas dos consultas.
   */
  private async etiquetasDe(recompensa: Recompensa): Promise<EtiquetaCatalogoDto[]> {
    const porRecompensa = await this.etiquetas.mapaPorRecompensa(recompensa.grupoId);

    return porRecompensa.get(recompensa.id) ?? [];
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
   * fase-14-22 decisión 13. En `DIRECTO` la zona es obligatoria y se valida
   * como siempre; en `TIENDA` se ignora aunque venga, porque ahí un ítem no
   * pertenece a ninguna zona.
   */
  private async resolverZona(
    grupoId: string,
    umbralZonaId?: string
  ): Promise<{ umbralZonaId: string | null; nombreZonaSnapshot: string | null }> {
    const modo = await this.configuracion.obtenerModo(grupoId);

    if (modo === ModoRecompensas.TIENDA) {
      return { umbralZonaId: null, nombreZonaSnapshot: null };
    }

    if (!umbralZonaId) {
      throw new BadRequestException({
        message: 'umbralZonaId es obligatorio en el modo DIRECTO',
        code: 'ZONA_REQUERIDA',
      });
    }

    return {
      umbralZonaId,
      nombreZonaSnapshot: await this.validarUmbral(umbralZonaId, grupoId),
    };
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
