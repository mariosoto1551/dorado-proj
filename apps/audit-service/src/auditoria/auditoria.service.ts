import { ForbiddenException, Injectable } from '@nestjs/common';

import { RegistroAuditoriaDto, TenantContext } from '@dorado/shared-types';

import type { RegistroAuditoria } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListarAuditoriaQuery, ListarAuditoriaResponse } from './dto/auditoria.dto';

const POR_PAGINA_DEFAULT = 20;

/**
 * Lectura de auditoría (spec fase-09): SOLO lectura — la escritura ocurre
 * exclusivamente vía consumo de eventos (nota de la spec: si un dato falta
 * acá, se modela como evento en el servicio de origen, nunca como POST en
 * audit). El filtro de tenant de Prisma acota por organización (+ grupoIds
 * para TUTOR, que además no ve filas org-level con grupoId null).
 */
@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /audit/grupos/:grupoId — paginado desc (lo más reciente primero). */
  async listarPorGrupo(
    tenant: TenantContext,
    grupoId: string,
    query: ListarAuditoriaQuery
  ): Promise<ListarAuditoriaResponse> {
    this.asegurarAccesoLectura(tenant, grupoId);

    const pagina = query.pagina ?? 1;
    const porPagina = query.porPagina ?? POR_PAGINA_DEFAULT;
    const where = {
      grupoId,
      ...(query.entidadTipo && { entidadTipo: query.entidadTipo }),
      ...(query.entidadId && { entidadId: query.entidadId }),
      ...((query.desde || query.hasta) && {
        createdAt: {
          ...(query.desde && { gte: new Date(query.desde) }),
          ...(query.hasta && { lte: new Date(query.hasta) }),
        },
      }),
    };

    const [filas, total] = await Promise.all([
      this.prisma.client.registroAuditoria.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.client.registroAuditoria.count({ where }),
    ]);

    return { items: filas.map(aDto), total, pagina, porPagina };
  }

  /**
   * GET /audit/entidades/:entidadTipo/:entidadId — timeline completo de una
   * entidad puntual, en orden CRONOLÓGICO (spec: responde "¿por qué me
   * descalificaron?").
   */
  async timelineDeEntidad(
    tenant: TenantContext,
    entidadTipo: string,
    entidadId: string
  ): Promise<RegistroAuditoriaDto[]> {
    const filas = await this.prisma.client.registroAuditoria.findMany({
      // El filtro automático de tenant acota organización (+ grupos del TUTOR).
      where: { entidadTipo, entidadId },
      orderBy: { createdAt: 'asc' },
    });

    return filas.map(aDto);
  }

  /**
   * Lectura local (mismo criterio que acceso-grupo de las otras fases): corta
   * explícito el TUTOR pidiendo un grupo ajeno; para ORG_ADMIN el filtro de
   * tenant ya limita a su organización. Sin REST: audit no llama a nadie.
   */
  private asegurarAccesoLectura(tenant: TenantContext, grupoId: string): void {
    if (tenant.grupoIds.length > 0 && !tenant.grupoIds.includes(grupoId)) {
      throw new ForbiddenException('Sin acceso a ese grupo');
    }
  }
}

function aDto(registro: RegistroAuditoria): RegistroAuditoriaDto {
  return {
    id: registro.id,
    organizacionId: registro.organizacionId,
    grupoId: registro.grupoId,
    actorId: registro.actorId,
    actorTipo: registro.actorTipo as RegistroAuditoriaDto['actorTipo'],
    accion: registro.accion,
    entidadTipo: registro.entidadTipo,
    entidadId: registro.entidadId,
    detalle: registro.detalle as Record<string, unknown>,
    createdAt: registro.createdAt.toISOString(),
  };
}
