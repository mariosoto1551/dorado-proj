import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';

import { InternalSecretGuard } from '@dorado/shared-auth';
import { ActividadDto, ConductaDto } from '@dorado/shared-types';

import { actividadADto, conductaADto } from '../comun/mapeadores';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Endpoints internos servicio-a-servicio (ADR-00 §4): protegidos por
 * `x-internal-secret`, NUNCA expuestos vía Gateway público. Trabajan con IDs
 * explícitos (el llamador interno es confiable) — sin contexto de tenant.
 *
 * Consumidor previsto (fase-09): notification-service resuelve
 * `nombreActividad`/`nombreConducta` para sus plantillas — los payloads de
 * eventos solo traen IDs a propósito (spec: no acoplar los payloads a nombres).
 * Se devuelve la fila aunque esté ARCHIVADA: una notificación sobre un
 * registro viejo sigue necesitando el nombre.
 */
@Controller('internal/activity')
@UseGuards(InternalSecretGuard)
export class InternalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('actividades/:id')
  async actividad(@Param('id') id: string): Promise<ActividadDto> {
    const actividad = await this.prisma.client.actividad.findFirst({ where: { id } });

    if (!actividad) {
      throw new NotFoundException('Actividad no encontrada');
    }

    return actividadADto(actividad);
  }

  @Get('conductas/:id')
  async conducta(@Param('id') id: string): Promise<ConductaDto> {
    const conducta = await this.prisma.client.conducta.findFirst({ where: { id } });

    if (!conducta) {
      throw new NotFoundException('Conducta no encontrada');
    }

    return conductaADto(conducta);
  }
}
