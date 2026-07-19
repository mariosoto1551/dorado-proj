import { Injectable, NotFoundException } from '@nestjs/common';

import { NotificacionDto, PrincipalType, TenantContext } from '@dorado/shared-types';

import type { Notificacion } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  MisNotificacionesQuery,
  MisNotificacionesResponse,
  NoLeidasCountResponse,
} from './dto/notificaciones.dto';

const POR_PAGINA_DEFAULT = 20;

/**
 * Endpoints de la campana (spec fase-09): SIEMPRE sobre las propias — el
 * destinatario sale del JWT (`sub`), nunca de un parámetro del cliente
 * (regla 3 de CLAUDE.md). El filtro de tenant de Prisma acota además por
 * organización.
 */
@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /notification/mis-notificaciones — paginado, createdAt desc. */
  async misNotificaciones(
    tenant: TenantContext,
    query: MisNotificacionesQuery
  ): Promise<MisNotificacionesResponse> {
    const pagina = query.pagina ?? 1;
    const porPagina = query.porPagina ?? POR_PAGINA_DEFAULT;
    const where = {
      destinatarioId: tenant.principalId,
      ...(query.leida !== undefined && { leida: query.leida === 'true' }),
    };

    const [filas, total] = await Promise.all([
      this.prisma.client.notificacion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.client.notificacion.count({ where }),
    ]);

    return { items: filas.map(aDto), total, pagina, porPagina };
  }

  /** GET /notification/no-leidas/count — para el badge de la campana. */
  async contarNoLeidas(tenant: TenantContext): Promise<NoLeidasCountResponse> {
    const count = await this.prisma.client.notificacion.count({
      where: { destinatarioId: tenant.principalId, leida: false },
    });

    return { count };
  }

  /** PATCH /notification/:id/leer — solo el dueño (404 si no es suya). */
  async marcarLeida(tenant: TenantContext, id: string): Promise<NotificacionDto> {
    const notificacion = await this.prisma.client.notificacion.findFirst({
      where: { id, destinatarioId: tenant.principalId },
    });

    if (!notificacion) {
      throw new NotFoundException('Notificación no encontrada');
    }

    await this.prisma.client.notificacion.updateMany({
      where: { id, destinatarioId: tenant.principalId },
      data: { leida: true },
    });

    return aDto({ ...notificacion, leida: true });
  }

  /** PATCH /notification/leer-todas — todas las propias. */
  async marcarTodasLeidas(tenant: TenantContext): Promise<{ actualizadas: number }> {
    const resultado = await this.prisma.client.notificacion.updateMany({
      where: { destinatarioId: tenant.principalId, leida: false },
      data: { leida: true },
    });

    return { actualizadas: resultado.count };
  }
}

function aDto(notificacion: Notificacion): NotificacionDto {
  return {
    id: notificacion.id,
    organizacionId: notificacion.organizacionId,
    grupoId: notificacion.grupoId,
    destinatarioId: notificacion.destinatarioId,
    destinatarioTipo: notificacion.destinatarioTipo as PrincipalType,
    tipo: notificacion.tipo,
    mensaje: notificacion.mensaje,
    leida: notificacion.leida,
    createdAt: notificacion.createdAt.toISOString(),
  };
}
