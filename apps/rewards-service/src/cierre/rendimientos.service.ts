import { BadRequestException, Injectable } from '@nestjs/common';

import { RendimientoZonaDto, TenantContext } from '@dorado/shared-types';

import { ScoringClientService } from '../clientes/scoring-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ConfigurarRendimientosRequest } from './dto/rendimientos.dto';

/**
 * Rendimiento en monedas de cada zona (spec fase-14-22, decisiones 4 y 11).
 *
 * La lista SIEMPRE sale de las zonas reales de scoring, no de las filas
 * guardadas: una zona sin configurar tiene que aparecer igual (con `monedas:
 * null`), porque si no el Tutor no tiene dónde cargarla.
 */
@Injectable()
export class RendimientosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringClientService,
    private readonly acceso: AccesoGrupoService,
    private readonly eventos: EventosPublisherService
  ) {}

  async listar(tenant: TenantContext, grupoId: string): Promise<RendimientoZonaDto[]> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const [zonas, configurados] = await Promise.all([
      this.scoring.umbralesDelGrupo(grupoId),
      this.prisma.client.rendimientoZona.findMany({ where: { grupoId } }),
    ]);

    const porZona = new Map(configurados.map((fila) => [fila.umbralZonaId, fila.monedas]));

    return zonas.map((zona) => ({
      umbralZonaId: zona.id,
      nombreZona: zona.nombreZona,
      orden: zona.orden,
      colorHex: zona.colorHex,
      monedas: porZona.get(zona.id) ?? null,
    }));
  }

  /** Idempotente: reemplaza el rendimiento de cada zona que venga en el body. */
  async configurar(
    tenant: TenantContext,
    grupoId: string,
    datos: ConfigurarRendimientosRequest
  ): Promise<RendimientoZonaDto[]> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const zonas = await this.scoring.umbralesDelGrupo(grupoId);
    const porId = new Map(zonas.map((zona) => [zona.id, zona]));

    for (const rendimiento of datos.rendimientos) {
      const zona = porId.get(rendimiento.umbralZonaId);

      // Misma validación que el catálogo de Fase 8: la zona tiene que existir
      // Y ser de ESTE grupo (regla 2: se cruza por ID vía REST, nunca por join).
      if (!zona) {
        throw new BadRequestException(
          'umbralZonaId no corresponde a una zona de este grupo'
        );
      }

      await this.prisma.client.rendimientoZona.upsert({
        where: { umbralZonaId: rendimiento.umbralZonaId },
        create: {
          // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
          organizacionId: tenant.organizacionId,
          grupoId,
          umbralZonaId: rendimiento.umbralZonaId,
          nombreZonaSnapshot: zona.nombreZona,
          monedas: rendimiento.monedas,
        },
        update: {
          nombreZonaSnapshot: zona.nombreZona,
          monedas: rendimiento.monedas,
        },
      });
    }

    // Retrofit fase-09: rastro de auditoría de toda escritura administrativa.
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion: 'RENDIMIENTOS_CONFIGURADOS',
      entidadTipo: 'RendimientoZona',
      entidadId: grupoId,
      detalle: { despues: datos.rendimientos },
    });

    return await this.listar(tenant, grupoId);
  }
}
