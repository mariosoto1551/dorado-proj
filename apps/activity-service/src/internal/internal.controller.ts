import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';

import { InternalSecretGuard } from '@dorado/shared-auth';
import {
  ActividadDto,
  AlcanceActividad,
  CatalogoRendibleDto,
  ComportamientoAlCierre,
  ConductaDto,
  TipoPuntaje,
} from '@dorado/shared-types';

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

  /**
   * fase-14-28 (D.3): el catálogo del Grupo que PUEDE pagar monedas, para la
   * pantalla de rendimientos por acción de rewards y para validar cada
   * `origenId` del `PUT` (regla 2: se cruza por ID vía REST, nunca por join).
   *
   * Solo lo ACTIVO, y de conductas solo las BUENA: una MALA no tiene nada que
   * configurar (decisión 4 — lo que se hace nunca debita) y mostrarla con un
   * campo bloqueado invita a preguntar por qué existe (decisión 17).
   *
   * A diferencia de los dos GET de arriba, acá SÍ se filtra por estado: esto
   * alimenta una pantalla de configuración, no la resolución del nombre de algo
   * que ya pasó.
   */
  @Get('grupos/:grupoId/catalogo-rendible')
  async catalogoRendible(@Param('grupoId') grupoId: string): Promise<CatalogoRendibleDto> {
    const [actividades, conductas] = await Promise.all([
      this.prisma.client.actividad.findMany({
        where: { grupoId, estado: 'ACTIVA' },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.client.conducta.findMany({
        where: { grupoId, estado: 'ACTIVA', tipo: 'BUENA' },
        orderBy: { nombre: 'asc' },
      }),
    ]);

    return {
      actividades: actividades.map((actividad) => ({
        id: actividad.id,
        nombre: actividad.nombre,
        valorPuntos: actividad.valorPuntos,
        tipoPuntaje: actividad.tipoPuntaje as TipoPuntaje,
        alcance: actividad.alcance as AlcanceActividad,
        comportamientoAlCierre: actividad.comportamientoAlCierre as ComportamientoAlCierre,
        bonoJefePuntos: actividad.bonoJefePuntos,
        repeticionesMaximasSesion: actividad.repeticionesMaximasSesion,
      })),
      conductas: conductas.map((conducta) => ({
        id: conducta.id,
        nombre: conducta.nombre,
        valorPuntos: conducta.valorPuntos,
        // Una conducta no tiene ninguna de estas tres cosas: son de la Actividad.
        tipoPuntaje: null,
        alcance: null,
        comportamientoAlCierre: null,
        bonoJefePuntos: null,
        repeticionesMaximasSesion: null,
      })),
    };
  }
}
