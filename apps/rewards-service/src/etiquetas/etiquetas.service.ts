import { Injectable, NotFoundException } from '@nestjs/common';

import { EtiquetaCatalogoDto, TenantContext } from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  DemasiadasEtiquetasException,
  EtiquetaDuplicadaException,
  EtiquetaInvalidaException,
} from '../comun/excepciones';
import { etiquetaADto } from '../comun/mapeadores';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { EtiquetaCatalogo } from '../generated/prisma/client';
import { EstadoCatalogo } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  MAX_ETIQUETAS_POR_ITEM,
  type CrearEtiquetaRequest,
  type EditarEtiquetaRequest,
  type ListarEtiquetasQuery,
} from './dto/etiquetas.dto';

/**
 * Etiquetas del catálogo (spec fase-14-26). La entidad **no tiene efecto de
 * negocio**: no decide precios, no restringe visibilidad y no entra en ningún
 * sorteo. Por eso es la única archivable de este servicio que se puede
 * desarchivar (decisión 6) y la única cuyo archivado **no desasigna nada**
 * (decisión 7) — conservar las filas es lo que hace que desarchivar restituya
 * el estado exacto en vez de devolver una etiqueta vacía.
 */
@Injectable()
export class EtiquetasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoGrupoService,
    private readonly eventos: EventosPublisherService
  ) {}

  async crear(
    tenant: TenantContext,
    grupoId: string,
    datos: CrearEtiquetaRequest
  ): Promise<EtiquetaCatalogoDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const etiqueta = await this.crearFila(tenant, grupoId, datos);

    await this.auditar(tenant, grupoId, 'ETIQUETA_CREADA', etiqueta.id, {
      despues: etiquetaADto(etiqueta),
    });

    return etiquetaADto(etiqueta);
  }

  /** Sin `estado` devuelve solo las activas: es lo que pide toda pantalla. */
  async listar(
    tenant: TenantContext,
    grupoId: string,
    query: ListarEtiquetasQuery
  ): Promise<EtiquetaCatalogoDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const etiquetas = await this.prisma.client.etiquetaCatalogo.findMany({
      where: { grupoId, estado: query.estado ?? EstadoCatalogo.ACTIVA },
      orderBy: { nombre: 'asc' },
    });

    return etiquetas.map(etiquetaADto);
  }

  async editar(
    tenant: TenantContext,
    id: string,
    datos: EditarEtiquetaRequest
  ): Promise<EtiquetaCatalogoDto> {
    const existente = await this.buscarAccesible(id);

    if (datos.nombre !== undefined && datos.nombre !== existente.nombre) {
      await this.asegurarNombreLibre(existente.grupoId, datos.nombre);
    }

    await this.prisma.client.etiquetaCatalogo.updateMany({
      where: { id },
      data: {
        ...(datos.nombre !== undefined && { nombre: datos.nombre }),
        ...(datos.colorHex !== undefined && { colorHex: datos.colorHex }),
      },
    });

    const actualizada = await this.buscarAccesible(id);

    await this.auditar(tenant, existente.grupoId, 'ETIQUETA_EDITADA', id, {
      antes: etiquetaADto(existente),
      despues: etiquetaADto(actualizada),
    });

    return etiquetaADto(actualizada);
  }

  /**
   * Archiva. NO desasigna (decisión 7): la etiqueta desaparece de filtros,
   * chips y selectores, pero sus filas siguen ahí para que desarchivar
   * devuelva exactamente los mismos ítems.
   */
  async archivar(tenant: TenantContext, id: string): Promise<EtiquetaCatalogoDto> {
    return await this.cambiarEstado(tenant, id, EstadoCatalogo.ARCHIVADA);
  }

  /**
   * Desarchiva (decisión 6). Existe acá y no en productos ni bolsas porque es
   * la única reactivación de este servicio que no puede resucitar nada
   * comprable: vuelve a mostrar un chip.
   */
  async desarchivar(tenant: TenantContext, id: string): Promise<EtiquetaCatalogoDto> {
    const etiqueta = await this.buscarAccesible(id);

    // Renombrar otra etiqueta al nombre de una archivada es legal (el índice
    // único no distingue estado — de hecho lo impide), así que acá no puede
    // haber colisión. Se revalida igual: el costo es una consulta y la
    // alternativa es un 500 opaco si algún día el índice cambia.
    await this.asegurarNombreLibre(etiqueta.grupoId, etiqueta.nombre, id);

    return await this.cambiarEstado(tenant, id, EstadoCatalogo.ACTIVA);
  }

  /**
   * Reemplazo COMPLETO del juego de etiquetas de un ítem: lo que viene es lo
   * que queda (spec B.1). Devuelve las etiquetas resultantes.
   */
  async asignar(
    tenant: TenantContext,
    recompensaId: string,
    etiquetaIds: string[]
  ): Promise<EtiquetaCatalogoDto[]> {
    const recompensa = await this.prisma.client.recompensa.findFirst({
      where: { id: recompensaId },
    });

    if (!recompensa) {
      throw new NotFoundException('Recompensa no encontrada');
    }

    const unicos = [...new Set(etiquetaIds)];

    if (unicos.length > MAX_ETIQUETAS_POR_ITEM) {
      throw new DemasiadasEtiquetasException(MAX_ETIQUETAS_POR_ITEM);
    }

    const etiquetas = await this.validarEtiquetas(recompensa.grupoId, unicos);
    const antes = await this.prisma.client.etiquetaEnRecompensa.findMany({
      where: { recompensaId },
    });

    await this.prisma.client.etiquetaEnRecompensa.deleteMany({ where: { recompensaId } });

    if (unicos.length > 0) {
      await this.prisma.client.etiquetaEnRecompensa.createMany({
        data: unicos.map((etiquetaId) => ({ etiquetaId, recompensaId })),
      });
    }

    await this.auditar(
      tenant,
      recompensa.grupoId,
      'RECOMPENSA_ETIQUETADA',
      recompensaId,
      {
        antes: { etiquetaIds: antes.map((fila) => fila.etiquetaId) },
        despues: { etiquetaIds: unicos },
      },
      'Recompensa'
    );

    return etiquetas.map(etiquetaADto);
  }

  /**
   * Etiquetas activas por recompensa, para pintar los chips de una lista sin
   * una llamada por ítem.
   *
   * **Costo cero para quien no usa el ítem** (mismo gate que el `necesitaTimezone`
   * de activity y que el cruce de roles del #19): si el grupo no tiene ninguna
   * etiqueta activa, corta en la primera consulta y no toca la tabla de
   * asignaciones. Un grupo que nunca creó una etiqueta paga exactamente una
   * consulta más que antes del ítem, y ninguna sobre datos que no existen.
   */
  async mapaPorRecompensa(grupoId: string): Promise<Map<string, EtiquetaCatalogoDto[]>> {
    const mapa = new Map<string, EtiquetaCatalogoDto[]>();

    const etiquetas = await this.prisma.client.etiquetaCatalogo.findMany({
      where: { grupoId, estado: EstadoCatalogo.ACTIVA },
      orderBy: { nombre: 'asc' },
    });

    if (etiquetas.length === 0) {
      return mapa;
    }

    // Las asignaciones de TODO el grupo en una consulta: la tabla es chica
    // (catálogo × 5 como mucho) y evita una query por ítem listado.
    const asignaciones = await this.prisma.client.etiquetaEnRecompensa.findMany({
      where: { etiquetaId: { in: etiquetas.map((etiqueta) => etiqueta.id) } },
    });

    const porId = new Map(etiquetas.map((etiqueta) => [etiqueta.id, etiqueta]));

    for (const asignacion of asignaciones) {
      const etiqueta = porId.get(asignacion.etiquetaId);

      if (!etiqueta) {
        continue;
      }

      const acumuladas = mapa.get(asignacion.recompensaId) ?? [];

      acumuladas.push(etiquetaADto(etiqueta));
      mapa.set(asignacion.recompensaId, acumuladas);
    }

    return mapa;
  }

  /** Ids de los ítems que llevan una etiqueta dada, sin importar su estado. */
  async recompensasDeEtiqueta(etiquetaId: string): Promise<string[]> {
    const asignaciones = await this.prisma.client.etiquetaEnRecompensa.findMany({
      where: { etiquetaId },
    });

    return asignaciones.map((asignacion) => asignacion.recompensaId);
  }

  /** Etiqueta accesible y ACTIVA del grupo pedido, o 400 con código estable. */
  async asegurarEtiquetaDelGrupo(
    grupoId: string,
    etiquetaId: string
  ): Promise<EtiquetaCatalogo> {
    const [etiqueta] = await this.validarEtiquetas(grupoId, [etiquetaId]);

    return etiqueta;
  }

  private async cambiarEstado(
    tenant: TenantContext,
    id: string,
    estado: EstadoCatalogo
  ): Promise<EtiquetaCatalogoDto> {
    const existente = await this.buscarAccesible(id);

    await this.prisma.client.etiquetaCatalogo.updateMany({ where: { id }, data: { estado } });

    const accion =
      estado === EstadoCatalogo.ARCHIVADA ? 'ETIQUETA_ARCHIVADA' : 'ETIQUETA_DESARCHIVADA';

    await this.auditar(tenant, existente.grupoId, accion, id, {
      antes: etiquetaADto(existente),
    });

    return etiquetaADto({ ...existente, estado });
  }

  /**
   * Todas existen, son del MISMO grupo que el ítem y están ACTIVAS. Devuelve
   * las filas en el orden pedido para poder responder con ellas.
   */
  private async validarEtiquetas(
    grupoId: string,
    etiquetaIds: string[]
  ): Promise<EtiquetaCatalogo[]> {
    if (etiquetaIds.length === 0) {
      return [];
    }

    const etiquetas = await this.prisma.client.etiquetaCatalogo.findMany({
      where: { grupoId, estado: EstadoCatalogo.ACTIVA, id: { in: etiquetaIds } },
    });

    if (etiquetas.length !== etiquetaIds.length) {
      throw new EtiquetaInvalidaException();
    }

    return etiquetas;
  }

  private async crearFila(
    tenant: TenantContext,
    grupoId: string,
    datos: CrearEtiquetaRequest
  ): Promise<EtiquetaCatalogo> {
    try {
      return await this.prisma.client.etiquetaCatalogo.create({
        data: {
          // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
          organizacionId: tenant.organizacionId,
          grupoId,
          nombre: datos.nombre,
          colorHex: datos.colorHex,
        },
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        throw this.duplicada();
      }

      throw error;
    }
  }

  private async asegurarNombreLibre(
    grupoId: string,
    nombre: string,
    exceptoId?: string
  ): Promise<void> {
    const existente = await this.prisma.client.etiquetaCatalogo.findFirst({
      where: { grupoId, nombre },
    });

    if (existente && existente.id !== exceptoId) {
      throw this.duplicada();
    }
  }

  private duplicada(): EtiquetaDuplicadaException {
    return new EtiquetaDuplicadaException();
  }

  private async buscarAccesible(id: string): Promise<EtiquetaCatalogo> {
    const etiqueta = await this.prisma.client.etiquetaCatalogo.findFirst({ where: { id } });

    if (!etiqueta) {
      throw new NotFoundException('Etiqueta no encontrada');
    }

    return etiqueta;
  }

  private async auditar(
    tenant: TenantContext,
    grupoId: string,
    accion: string,
    entidadId: string,
    detalle: Record<string, unknown>,
    entidadTipo = 'EtiquetaCatalogo'
  ): Promise<void> {
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion,
      entidadTipo,
      entidadId,
      detalle,
    });
  }
}
