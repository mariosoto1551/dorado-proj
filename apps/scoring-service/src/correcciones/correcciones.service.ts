import { Injectable, NotFoundException } from '@nestjs/common';

import { EventoPuntosDto, TenantContext } from '@dorado/shared-types';

import { eventoPuntosADto } from '../comun/mapeadores';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { TipoOrigenPuntos } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { CorregirEventoPuntosRequest } from './dto/correcciones.dto';

/**
 * Corrección explícita de un asiento del ledger (spec fase-07): SIEMPRE una
 * fila nueva con `corregidoDeId` y `motivoCorreccion` — nunca UPDATE/DELETE
 * de la original (regla 6 de CLAUDE.md: lo cerrado no se edita silenciosamente,
 * se corrige a la vista).
 *
 * Se permite incluso con la Sección ya CERRADA; si esa Sección ya tiene
 * `ResultadoSeccion`, este endpoint NO lo actualiza (el snapshot histórico se
 * mantiene — evita reabrir recompensas ya entregadas, decisión de la spec).
 */
@Injectable()
export class CorreccionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: EventosPublisherService
  ) {}

  async corregir(
    tenant: TenantContext,
    eventoPuntosId: string,
    datos: CorregirEventoPuntosRequest
  ): Promise<EventoPuntosDto> {
    // findFirst tenant-filtrado: 404 si no existe o es de otra org/grupo.
    const original = await this.prisma.client.eventoPuntos.findFirst({
      where: { id: eventoPuntosId },
    });

    if (!original) {
      throw new NotFoundException('Evento de puntos no encontrado');
    }

    const correccion = await this.prisma.client.eventoPuntos.create({
      data: {
        organizacionId: original.organizacionId,
        grupoId: original.grupoId,
        usuarioId: original.usuarioId,
        seccionId: original.seccionId,
        sesionId: original.sesionId,
        tipoOrigen: TipoOrigenPuntos.CORRECCION,
        origenId: original.id,
        puntosSnapshot: datos.puntosAjuste,
        registradoPorId: tenant.principalId,
        registradoPorTipo: tenant.principalType,
        corregidoDeId: original.id,
        motivoCorreccion: datos.motivo,
      },
    });

    // Retrofit fase-09: el rastro de la corrección es el que resuelve
    // disputas de puntaje (spec) — particularmente importante en auditoría.
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: original.organizacionId,
      grupoId: original.grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion: 'EVENTO_PUNTOS_CORREGIDO',
      entidadTipo: 'EventoPuntos',
      entidadId: original.id,
      detalle: {
        motivo: datos.motivo,
        puntosAjuste: datos.puntosAjuste,
        correccionId: correccion.id,
        usuarioId: original.usuarioId,
        seccionId: original.seccionId,
        original: eventoPuntosADto(original),
      },
    });

    return eventoPuntosADto(correccion);
  }
}
