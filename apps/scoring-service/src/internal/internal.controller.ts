import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';

import { InternalSecretGuard } from '@dorado/shared-auth';
import { UmbralZonaDto } from '@dorado/shared-types';

import {
  resultadoAResponse,
  umbralADto,
  type ResultadoSeccionResponse,
} from '../comun/mapeadores';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Endpoints internos servicio-a-servicio (ADR-00 §4): protegidos por
 * `x-internal-secret`, NUNCA expuestos vía Gateway público. Trabajan con IDs
 * explícitos (el llamador interno es confiable) — sin contexto de tenant.
 *
 * Consumidor previsto (spec fase-07): rewards-service en Fase 8 — `umbrales/:id`
 * para validar que una Recompensa referencia una zona real, `.../resultado`
 * para saber a qué zona quedó habilitado un usuario y si está descalificado.
 */
@Controller('internal/scoring')
@UseGuards(InternalSecretGuard)
export class InternalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('umbrales/:id')
  async umbral(@Param('id') id: string): Promise<UmbralZonaDto> {
    const umbral = await this.prisma.client.umbralZona.findFirst({ where: { id } });

    if (!umbral) {
      throw new NotFoundException('Umbral no encontrado');
    }

    return umbralADto(umbral);
  }

  @Get('usuarios/:usuarioId/secciones/:seccionId/resultado')
  async resultado(
    @Param('usuarioId') usuarioId: string,
    @Param('seccionId') seccionId: string
  ): Promise<ResultadoSeccionResponse> {
    const resultado = await this.prisma.client.resultadoSeccion.findFirst({
      where: { usuarioId, seccionId },
    });

    if (!resultado) {
      // 404 = esa Sección todavía no se evaluó para ese usuario (spec).
      throw new NotFoundException('Resultado no encontrado — la sección aún no fue evaluada');
    }

    return resultadoAResponse(resultado);
  }
}
