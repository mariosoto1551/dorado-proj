import { Injectable } from '@nestjs/common';

import {
  AdminListarOrganizacionesResponse,
  AdminOrganizacionDetalleDto,
  AdminOrganizacionResumenDto,
  CodigoPlan,
  EstadoOrganizacion,
} from '@dorado/shared-types';

import { BillingClientService } from '../billing/billing-client.service';
import { OrganizacionNoEncontradaException } from '../comun/excepciones';
import { grupoADto, organizacionADto } from '../comun/mapeadores';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Organizacion } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface FiltrosListarOrganizaciones {
  q?: string;
  plan?: CodigoPlan;
  estado?: EstadoOrganizacion;
  page: number;
  pageSize: number;
}

/**
 * Lógica del panel de PLATFORM_ADMIN (fase-14-05). Es CROSS-TENANT por diseño:
 * corre bajo `PlatformAdminGuard`, que NO setea contexto de tenant, así que el
 * filtro automático de Prisma no recorta estas queries. El filtrado por
 * `organizacionId` (cuando aplica, ej. conteos de una org) es explícito acá.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingClientService,
    private readonly eventos: EventosPublisherService
  ) {}

  async listarOrganizaciones(
    filtros: FiltrosListarOrganizaciones
  ): Promise<AdminListarOrganizacionesResponse> {
    const q = filtros.q?.trim();

    // Volumen piloto: se traen las orgs que matchean texto+estado (sin paginar
    // en DB), se resuelve el plan de cada una vía billing y, si hace falta, se
    // filtra por plan en memoria antes de paginar. A escala mayor, replicar el
    // plan en identity o exponer un filtro por plan en billing (fase-14-05).
    const organizaciones = await this.prisma.client.organizacion.findMany({
      where: {
        ...(filtros.estado && { estado: filtros.estado }),
        ...(q && {
          OR: [
            { nombre: { contains: q, mode: 'insensitive' } },
            { emailContacto: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
    });

    const [gruposPorOrg, tutoresPorOrg, usuariosPorOrg] = await Promise.all([
      this.prisma.client.grupo.groupBy({ by: ['organizacionId'], _count: { _all: true } }),
      this.prisma.client.tutor.groupBy({ by: ['organizacionId'], _count: { _all: true } }),
      this.prisma.client.usuario.groupBy({ by: ['organizacionId'], _count: { _all: true } }),
    ]);

    const conteoGrupos = aMapaConteo(gruposPorOrg);
    const conteoTutores = aMapaConteo(tutoresPorOrg);
    const conteoUsuarios = aMapaConteo(usuariosPorOrg);

    const resumenes = await Promise.all(
      organizaciones.map(async (org): Promise<AdminOrganizacionResumenDto> => {
        const plan = await this.billing.resolvePlan(org.id);

        return {
          id: org.id,
          nombre: org.nombre,
          emailContacto: org.emailContacto,
          estado: org.estado as EstadoOrganizacion,
          plan,
          cantidadGrupos: conteoGrupos.get(org.id) ?? 0,
          cantidadTutores: conteoTutores.get(org.id) ?? 0,
          cantidadUsuarios: conteoUsuarios.get(org.id) ?? 0,
          createdAt: org.createdAt.toISOString(),
        };
      })
    );

    const filtradas = filtros.plan
      ? resumenes.filter((r) => r.plan === filtros.plan)
      : resumenes;

    const total = filtradas.length;
    const inicio = (filtros.page - 1) * filtros.pageSize;
    const items = filtradas.slice(inicio, inicio + filtros.pageSize);

    return { items, total, page: filtros.page, pageSize: filtros.pageSize };
  }

  async detalleOrganizacion(id: string): Promise<AdminOrganizacionDetalleDto> {
    const organizacion = await this.buscarOrganizacion(id);

    const [grupos, cantidadTutores, cantidadUsuarios, suscripcion] = await Promise.all([
      this.prisma.client.grupo.findMany({
        where: { organizacionId: id },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.tutor.count({ where: { organizacionId: id } }),
      this.prisma.client.usuario.count({ where: { organizacionId: id } }),
      this.billing.obtenerSuscripcion(id),
    ]);

    return {
      organizacion: organizacionADto(organizacion),
      plan: suscripcion.plan,
      suscripcion,
      grupos: grupos.map(grupoADto),
      cantidadTutores,
      cantidadUsuarios,
      // Diferido en este corte: el timeline de audit es tenant-scoped y no hay
      // interno cross-tenant todavía (criterio de aceptación opcional, fase-14-05).
      historialAdministrativo: [],
    };
  }

  async cambiarPlan(id: string, plan: CodigoPlan, adminId: string) {
    await this.buscarOrganizacion(id);

    const planActual = await this.billing.resolvePlan(id);
    const suscripcion = await this.billing.cambiarPlan(id, plan);

    await this.eventos.publicarAccionAdministrativa({
      organizacionId: id,
      actorId: adminId,
      actorTipo: 'PLATFORM_ADMIN',
      accion: 'PLAN_CAMBIADO',
      entidadTipo: 'Organizacion',
      entidadId: id,
      detalle: { de: planActual, a: plan },
    });

    return { suscripcion };
  }

  async cambiarEstado(id: string, estado: EstadoOrganizacion, adminId: string) {
    const organizacion = await this.buscarOrganizacion(id);

    const actualizada = await this.prisma.client.organizacion.update({
      where: { id },
      data: { estado },
    });

    await this.eventos.publicarAccionAdministrativa({
      organizacionId: id,
      actorId: adminId,
      actorTipo: 'PLATFORM_ADMIN',
      accion: estado === EstadoOrganizacion.SUSPENDIDA ? 'ORG_SUSPENDIDA' : 'ORG_REACTIVADA',
      entidadTipo: 'Organizacion',
      entidadId: id,
      detalle: { de: organizacion.estado, a: estado },
    });

    return { organizacion: organizacionADto(actualizada) };
  }

  private async buscarOrganizacion(id: string): Promise<Organizacion> {
    const organizacion = await this.prisma.client.organizacion.findUnique({ where: { id } });

    if (!organizacion) {
      throw new OrganizacionNoEncontradaException();
    }

    return organizacion;
  }
}

/** Convierte el resultado de un `groupBy` por organizacionId a un mapa id→conteo. */
function aMapaConteo(
  filas: { organizacionId: string; _count: { _all: number } }[]
): Map<string, number> {
  return new Map(filas.map((fila) => [fila.organizacionId, fila._count._all]));
}
