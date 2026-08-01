import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { BolsaPremiosDto, TenantContext } from '@dorado/shared-types';

import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { EstadoCatalogo } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { GuardarBolsaRequest } from './dto/tienda.dto';

/**
 * Bolsas de premios (spec fase-14-22 decisiones 19 y 20).
 *
 * SIEMPRE de premios: meter un ítem `CASTIGO` en una bolsa es un 400. Entre
 * esa validación y la de `ProductoTienda`, **un castigo no llega a la tienda
 * por ningún camino** — no es una regla que haya que recordar aplicar, son dos
 * puertas y las dos están cerradas.
 *
 * La bolsa es siempre explícita (decisión 19): no existe «todo el catálogo».
 * El atajo «agregar todos» es del frontend, y precarga la lista — que después
 * queda editable y visible antes de guardar.
 */
@Injectable()
export class BolsasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoGrupoService,
    private readonly eventos: EventosPublisherService
  ) {}

  async crear(
    tenant: TenantContext,
    grupoId: string,
    datos: GuardarBolsaRequest
  ): Promise<BolsaPremiosDto> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);
    await this.validarItems(grupoId, datos.recompensaIds);

    const bolsa = await this.prisma.client.bolsaPremios.create({
      data: {
        // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
        organizacionId: tenant.organizacionId,
        grupoId,
        nombre: datos.nombre,
        items: { create: datos.recompensaIds.map((recompensaId) => ({ recompensaId })) },
      },
      include: { items: true },
    });

    await this.auditar(tenant, grupoId, 'BOLSA_CREADA', bolsa.id, {
      despues: { nombre: datos.nombre, recompensaIds: datos.recompensaIds },
    });

    return aDto(bolsa);
  }

  async listar(tenant: TenantContext, grupoId: string): Promise<BolsaPremiosDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const bolsas = await this.prisma.client.bolsaPremios.findMany({
      where: { grupoId },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    return bolsas.map(aDto);
  }

  /** Reemplaza nombre e ítems completos: la lista es explícita, no incremental. */
  async editar(
    tenant: TenantContext,
    id: string,
    datos: GuardarBolsaRequest
  ): Promise<BolsaPremiosDto> {
    const existente = await this.buscarAccesible(id);

    await this.validarItems(existente.grupoId, datos.recompensaIds);

    await this.prisma.client.bolsaPremios.updateMany({
      where: { id },
      data: { nombre: datos.nombre },
    });

    await this.prisma.client.itemBolsa.deleteMany({ where: { bolsaId: id } });
    await this.prisma.client.itemBolsa.createMany({
      data: datos.recompensaIds.map((recompensaId) => ({ bolsaId: id, recompensaId })),
    });

    await this.auditar(tenant, existente.grupoId, 'BOLSA_EDITADA', id, {
      antes: aDto(existente),
      despues: { nombre: datos.nombre, recompensaIds: datos.recompensaIds },
    });

    return await this.obtener(id);
  }

  async archivar(tenant: TenantContext, id: string): Promise<BolsaPremiosDto> {
    const existente = await this.buscarAccesible(id);

    await this.prisma.client.bolsaPremios.updateMany({
      where: { id },
      data: { estado: EstadoCatalogo.ARCHIVADA },
    });

    await this.auditar(tenant, existente.grupoId, 'BOLSA_ARCHIVADA', id, {
      antes: aDto(existente),
    });

    return await this.obtener(id);
  }

  /**
   * Los ítems tienen que existir, ser del MISMO grupo y ser PREMIO
   * (decisión 20). Sin ítems no hay bolsa: una bolsa vacía haría fallar el
   * sorteo recién en el momento de comprar, que es el peor lugar para enterarse.
   */
  private async validarItems(grupoId: string, recompensaIds: string[]): Promise<void> {
    const items = await this.prisma.client.recompensa.findMany({
      where: { grupoId, id: { in: recompensaIds } },
    });

    if (items.length !== recompensaIds.length) {
      throw new BadRequestException({
        message: 'Algún ítem no existe o no es de este grupo',
        code: 'ITEM_INVALIDO',
      });
    }

    if (items.some((item) => item.tipo === 'CASTIGO')) {
      throw new BadRequestException({
        message: 'Una bolsa no puede contener castigos: son siempre de premios',
        code: 'CASTIGO_NO_VA_EN_BOLSA',
      });
    }
  }

  private async obtener(id: string): Promise<BolsaPremiosDto> {
    const bolsa = await this.prisma.client.bolsaPremios.findFirst({
      where: { id },
      include: { items: true },
    });

    if (!bolsa) {
      throw new NotFoundException('Bolsa no encontrada');
    }

    return aDto(bolsa);
  }

  private async buscarAccesible(id: string) {
    const bolsa = await this.prisma.client.bolsaPremios.findFirst({
      where: { id },
      include: { items: true },
    });

    if (!bolsa) {
      throw new NotFoundException('Bolsa no encontrada');
    }

    return bolsa;
  }

  private async auditar(
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
      entidadTipo: 'BolsaPremios',
      entidadId,
      detalle,
    });
  }
}

function aDto(bolsa: {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  estado: string;
  items: { recompensaId: string }[];
}): BolsaPremiosDto {
  return {
    id: bolsa.id,
    organizacionId: bolsa.organizacionId,
    grupoId: bolsa.grupoId,
    nombre: bolsa.nombre,
    estado: bolsa.estado as 'ACTIVA' | 'ARCHIVADA',
    recompensaIds: bolsa.items.map((item) => item.recompensaId),
  };
}
