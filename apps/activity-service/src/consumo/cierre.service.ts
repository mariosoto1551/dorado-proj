import { Injectable, Logger } from '@nestjs/common';

import type {
  EventEnvelope,
  NoHizoRegistradoPayload,
  SesionEventoPayload,
} from '@dorado/shared-events';
import { ROUTING_KEYS } from '@dorado/shared-events';

import { IdentityClientService } from '../clientes/identity-client.service';
import { estaDisponibleEn } from '../comun/programacion';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Actividad, RegistroActividad } from '../generated/prisma/client';
import {
  ComportamientoAlCierre,
  EstadoCatalogo,
  TipoPuntaje,
  TipoRegistroActividad,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/** Identificador de este consumidor en la tabla EventoProcesado (ADR-00 §5). */
export const CONSUMIDOR = 'activity-service';

/** Una fila NO_HIZO recién creada + la actividad que la originó (para el evento). */
interface NoHizoCreado {
  registro: RegistroActividad;
  seccionId: string;
}

/**
 * Castigo automático al cerrar la Sesión (spec fase-14-08, Parte C). Por cada
 * obligatoria `REQUIERE_CONFIRMACION` que el Usuario NO confirmó durante el
 * día, crea un `RegistroActividad(NO_HIZO)` de sistema y publica
 * `NoHizoRegistrado` → scoring resta.
 *
 * Corre SIN contexto de tenant (sin JWT): filtra explícitamente por
 * organizacionId/grupoId del envelope (mismo criterio que los consumidores de
 * scoring). Idempotente vía `EventoProcesado`: una reentrega no duplica.
 */
@Injectable()
export class CierreService {
  private readonly logger = new Logger(CierreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityClientService,
    private readonly eventos: EventosPublisherService
  ) {}

  async procesarSesionCerrada(envelope: EventEnvelope<SesionEventoPayload>): Promise<void> {
    if (await this.yaProcesado(envelope.eventId)) {
      return;
    }

    const { sesionId, seccionId, organizacionId, grupoId, fechaInicio } = envelope.payload;

    const todas = await this.prisma.client.actividad.findMany({
      where: {
        organizacionId,
        grupoId,
        estado: EstadoCatalogo.ACTIVA,
        tipoPuntaje: TipoPuntaje.OBLIGATORIA,
        comportamientoAlCierre: ComportamientoAlCierre.REQUIERE_CONFIRMACION,
      },
    });

    // fase-14-11: una obligatoria programada solo se castiga el día que le toca.
    // Sin esto el sistema restaría puntos por no hacer algo que no correspondía
    // hacer — bug de puntaje, no cosmético.
    const obligatorias = await this.filtrarProgramadasDelDia(todas, grupoId, fechaInicio);

    // Pares (usuario × obligatoria) que faltan penalizar. Se salta cualquiera
    // que ya tenga un registro de ESTA sesión: COMPLETADA (el usuario confirmó)
    // o NO_HIZO (un tutor ya lo marcó a mano — no duplicar).
    const pendientes = await this.paresPendientes(obligatorias, {
      organizacionId,
      grupoId,
      sesionId,
    });

    let creados: NoHizoCreado[] = [];

    try {
      creados = await this.prisma.client.$transaction(async (tx) => {
        const filas: NoHizoCreado[] = [];

        for (const { usuarioId, actividad } of pendientes) {
          const registro = await tx.registroActividad.create({
            data: {
              organizacionId,
              grupoId,
              usuarioId,
              actividadId: actividad.id,
              sesionId,
              seccionId,
              tipo: TipoRegistroActividad.NO_HIZO,
              // Snapshot al cierre: vale el valorPuntos vigente al cerrar.
              valorPuntosSnapshot: -actividad.valorPuntos,
              registradoPorId: 'SYSTEM',
              registradoPorTipo: 'SYSTEM',
            },
          });

          filas.push({ registro, seccionId });
        }

        // Marca de procesado en la MISMA transacción que los registros.
        await tx.eventoProcesado.create({
          data: { eventId: envelope.eventId, consumidor: CONSUMIDOR },
        });

        return filas;
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        // Otra entrega concurrente ganó la marca: el efecto ya está aplicado.
        this.logger.debug(`Evento ${envelope.eventId} procesado en paralelo — descartado`);

        return;
      }

      throw error;
    }

    // Publicar DESPUÉS del commit (patrón publicar-tras-commit, fase-02).
    for (const { registro } of creados) {
      await this.eventos.publicar<NoHizoRegistradoPayload>({
        eventType: 'NoHizoRegistrado',
        routingKey: ROUTING_KEYS.NO_HIZO_REGISTRADO,
        organizacionId,
        grupoId,
        payload: {
          registroId: registro.id,
          usuarioId: registro.usuarioId,
          actividadId: registro.actividadId,
          sesionId: registro.sesionId,
          seccionId: registro.seccionId,
          valorPuntosSnapshot: registro.valorPuntosSnapshot,
          registradoPorId: 'SYSTEM',
          registradoPorTipo: 'SYSTEM',
        },
      });
    }

    if (creados.length > 0) {
      this.logger.log(
        `SesionCerrada ${sesionId}: ${creados.length} no-hizo automáticos generados (grupo ${grupoId})`
      );
    }
  }

  /** Pares (usuarioId, actividad) sin registro de esta sesión — a penalizar. */
  private async paresPendientes(
    obligatorias: Actividad[],
    scope: { organizacionId: string; grupoId: string; sesionId: string }
  ): Promise<{ usuarioId: string; actividad: Actividad }[]> {
    if (obligatorias.length === 0) {
      return [];
    }

    const actividadIds = obligatorias.map((actividad) => actividad.id);

    const [usuarios, registros] = await Promise.all([
      this.identity.usuariosDelGrupo(scope.grupoId),
      this.prisma.client.registroActividad.findMany({
        where: {
          organizacionId: scope.organizacionId,
          grupoId: scope.grupoId,
          sesionId: scope.sesionId,
          actividadId: { in: actividadIds },
        },
        select: { usuarioId: true, actividadId: true },
      }),
    ]);

    const yaResuelto = new Set(
      registros.map((registro) => `${registro.usuarioId}::${registro.actividadId}`)
    );

    const pendientes: { usuarioId: string; actividad: Actividad }[] = [];

    for (const usuario of usuarios) {
      for (const actividad of obligatorias) {
        if (!yaResuelto.has(`${usuario.id}::${actividad.id}`)) {
          pendientes.push({ usuarioId: usuario.id, actividad });
        }
      }
    }

    return pendientes;
  }

  /**
   * Quita las obligatorias programadas (fase-14-11) que no correspondían al día
   * de la Sesión que se cerró. El día sale de `fechaInicio` de la Sesión, en la
   * timezone del Grupo — nunca del reloj del cierre: la Sesión del martes cierra
   * a las 00:00 del miércoles, así que "ahora" daría el día equivocado.
   *
   * Si el envelope llega **sin** `fechaInicio` (mensaje viejo en la cola durante
   * un despliegue) no se puede saber el día: se saltean TODAS las programadas.
   * Ante la duda no se restan puntos; las no programadas siguen igual.
   */
  private async filtrarProgramadasDelDia(
    obligatorias: Actividad[],
    grupoId: string,
    fechaInicioSesion: string | undefined
  ): Promise<Actividad[]> {
    const programadas = obligatorias.filter((actividad) => actividad.diasSemana.length > 0);

    if (programadas.length === 0) {
      return obligatorias;
    }

    if (!fechaInicioSesion) {
      this.logger.warn(
        `SesionCerrada sin fechaInicio en el payload — se saltean ${programadas.length} obligatoria(s) programada(s) del grupo ${grupoId}`
      );

      return obligatorias.filter((actividad) => actividad.diasSemana.length === 0);
    }

    const grupo = await this.identity.obtenerGrupo(grupoId);

    if (!grupo) {
      this.logger.warn(
        `Grupo ${grupoId} no encontrado en identity — se saltean las obligatorias programadas`
      );

      return obligatorias.filter((actividad) => actividad.diasSemana.length === 0);
    }

    const inicio = new Date(fechaInicioSesion);

    return obligatorias.filter((actividad) =>
      estaDisponibleEn(actividad.diasSemana, inicio, grupo.timezone)
    );
  }

  private async yaProcesado(eventId: string): Promise<boolean> {
    const fila = await this.prisma.client.eventoProcesado.findUnique({
      where: { eventId },
    });

    if (fila) {
      this.logger.debug(`Evento ${eventId} ya procesado — descartado`);
    }

    return fila !== null;
  }
}
