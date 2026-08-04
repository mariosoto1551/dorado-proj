import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { InternalSecretGuard } from '@dorado/shared-auth';
import {
  RecompensaDto,
  RendimientoAccionInternoDto,
  TipoAccionRendimiento,
} from '@dorado/shared-types';

import { recompensaADto } from '../comun/mapeadores';
import { EtiquetasService } from '../etiquetas/etiquetas.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Endpoints internos servicio-a-servicio (ADR-00 §4): protegidos por
 * `x-internal-secret`, NUNCA expuestos vía Gateway público. Trabajan con IDs
 * explícitos (el llamador interno es confiable) — sin contexto de tenant.
 *
 * **Nace en fase-14-29** (la spec de Fase 8 no definía ninguno para rewards, y
 * hasta acá el módulo interno solo tenía el health). Su único consumidor es
 * `ai-service`, para las herramientas de lectura `listar_recompensas` y
 * `listar_rendimientos_monedas` — el asistente tiene que ver los precios y lo
 * que paga cada acción para poder calibrar la economía.
 *
 * Los dos son de LECTURA y así se quedan: la decisión 6 del ítem dice que la
 * IA no escribe en ningún servicio, y una escritura interna nueva acá sería
 * exactamente la superficie que el diseño existe para no tener.
 */
@Controller('internal/rewards')
@UseGuards(InternalSecretGuard)
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly etiquetas: EtiquetasService
  ) {}

  /**
   * Catálogo de recompensas del Grupo, con sus etiquetas del fase-14-26.
   *
   * Devuelve también las ARCHIVADAS salvo que se filtre: para proponer precios
   * hace falta ver qué se dejó de ofrecer y por qué, no solo lo vigente.
   */
  @Get('grupos/:grupoId/recompensas')
  async recompensasDelGrupo(
    @Param('grupoId') grupoId: string,
    @Query('estado') estado?: string
  ): Promise<RecompensaDto[]> {
    const recompensas = await this.prisma.client.recompensa.findMany({
      where: {
        grupoId,
        ...(estado === 'ACTIVA' || estado === 'ARCHIVADA' ? { estado } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    const porRecompensa = await this.etiquetas.mapaPorRecompensa(grupoId);

    return recompensas.map((recompensa) =>
      recompensaADto(recompensa, porRecompensa.get(recompensa.id) ?? [])
    );
  }

  /**
   * Lo que paga cada acción en monedas (fase-14-28), tal como está guardado.
   *
   * **Sin cruzar con el catálogo de activity**, a diferencia de la pantalla del
   * Tutor: quien consume esto tiene su propia herramienta para listar el
   * catálogo, y hacer el fan-out acá metería una llamada rewards→activity en un
   * camino de solo lectura que no la necesita. `nombreSnapshot` alcanza para
   * que se entienda de qué acción se está hablando.
   *
   * Una acción sin rendimiento configurado simplemente no tiene fila — no paga
   * nada, que es el default del ítem.
   */
  @Get('grupos/:grupoId/rendimientos')
  async rendimientosDelGrupo(
    @Param('grupoId') grupoId: string
  ): Promise<RendimientoAccionInternoDto[]> {
    const rendimientos = await this.prisma.client.rendimientoAccion.findMany({
      where: { grupoId },
      orderBy: { nombreSnapshot: 'asc' },
    });

    return rendimientos.map((rendimiento) => ({
      tipoAccion: rendimiento.tipoAccion as TipoAccionRendimiento,
      origenId: rendimiento.origenId,
      nombreSnapshot: rendimiento.nombreSnapshot,
      monedas: rendimiento.monedas,
      monedasBonoJefe: rendimiento.monedasBonoJefe,
    }));
  }
}
