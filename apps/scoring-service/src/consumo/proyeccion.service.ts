import { Injectable, Logger } from '@nestjs/common';

import type {
  ActividadCompletadaPayload,
  ActividadRegistroEliminadoPayload,
  ConductaRegistradaPayload,
  ConductaRegistroEliminadoPayload,
  EventEnvelope,
  NoHizoRegistradoPayload,
  TareaEquipoCompletadaPayload,
} from '@dorado/shared-events';

import { TipoOrigenPuntos } from '../generated/prisma/enums';
import { PrismaService, type ClientePrisma } from '../prisma/prisma.service';

/** Identificador de este consumidor en la tabla EventoProcesado (ADR-00 §5). */
export const CONSUMIDOR = 'scoring-service';

type TxProyeccion = Pick<ClientePrisma, 'eventoPuntos' | 'eventoProcesado'>;

/**
 * Proyección de los eventos de registro de activity-service al ledger
 * `EventoPuntos` (spec fase-07, tabla "Eventos consumidos"). Cada efecto es
 * idempotente: chequea `EventoProcesado` antes y lo inserta en la MISMA
 * transacción que la fila del ledger — una reentrega de RabbitMQ no duplica
 * puntos (criterio de aceptación 6).
 *
 * `origenId` guarda el `registroId` del registro de origen (no el id de la
 * Actividad/Conducta): es lo que permite ubicar el asiento exacto a compensar
 * cuando llega `ConductaRegistroEliminado` — ver docs/progreso/fase-07.
 *
 * NUNCA hay UPDATE/DELETE sobre EventoPuntos acá ni en ningún lado (regla 1
 * de CLAUDE.md): la eliminación de una conducta se compensa con una fila
 * nueva de signo opuesto.
 */
@Injectable()
export class ProyeccionService {
  private readonly logger = new Logger(ProyeccionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async procesarActividadCompletada(
    envelope: EventEnvelope<ActividadCompletadaPayload>
  ): Promise<void> {
    await this.proyectarRegistro(envelope, TipoOrigenPuntos.ACTIVIDAD_COMPLETADA, {
      usuarioId: envelope.payload.usuarioId,
      seccionId: envelope.payload.seccionId,
      sesionId: envelope.payload.sesionId,
      origenId: envelope.payload.registroId,
      puntosSnapshot: envelope.payload.valorPuntosSnapshot,
      registradoPorId: envelope.payload.registradoPorId,
      registradoPorTipo: envelope.payload.registradoPorTipo,
    });
  }

  async procesarNoHizoRegistrado(
    envelope: EventEnvelope<NoHizoRegistradoPayload>
  ): Promise<void> {
    // valorPuntosSnapshot ya viene negativo (event-catalog).
    await this.proyectarRegistro(envelope, TipoOrigenPuntos.NO_HIZO, {
      usuarioId: envelope.payload.usuarioId,
      seccionId: envelope.payload.seccionId,
      sesionId: envelope.payload.sesionId,
      origenId: envelope.payload.registroId,
      puntosSnapshot: envelope.payload.valorPuntosSnapshot,
      registradoPorId: envelope.payload.registradoPorId,
      registradoPorTipo: envelope.payload.registradoPorTipo,
    });
  }

  async procesarConductaRegistrada(
    envelope: EventEnvelope<ConductaRegistradaPayload>
  ): Promise<void> {
    // valorPuntosSnapshot ya trae el signo según BUENA/MALA (event-catalog).
    await this.proyectarRegistro(envelope, TipoOrigenPuntos.CONDUCTA, {
      usuarioId: envelope.payload.usuarioId,
      seccionId: envelope.payload.seccionId,
      sesionId: envelope.payload.sesionId,
      origenId: envelope.payload.registroId,
      puntosSnapshot: envelope.payload.valorPuntosSnapshot,
      registradoPorId: envelope.payload.registradoPorId,
      registradoPorTipo: envelope.payload.registradoPorTipo,
    });
  }

  /**
   * Reparto de una tarea de equipo (fase-14-09): crea un EventoPuntos por cada
   * asignación (miembro), etiquetado con `equipoId`. `asignaciones` ya trae el
   * valor resuelto (base + bono del jefe) — scoring no recalcula. Todas las
   * filas + la marca de procesado van en UNA transacción idempotente.
   */
  async procesarTareaEquipoCompletada(
    envelope: EventEnvelope<TareaEquipoCompletadaPayload>
  ): Promise<void> {
    if (await this.yaProcesado(envelope.eventId)) {
      return;
    }

    const payload = envelope.payload;

    await this.enTransaccionIdempotente(envelope.eventId, async (tx) => {
      for (const asignacion of payload.asignaciones) {
        await tx.eventoPuntos.create({
          data: {
            organizacionId: payload.organizacionId,
            grupoId: payload.grupoId,
            usuarioId: asignacion.usuarioId,
            seccionId: payload.seccionId,
            sesionId: payload.sesionId,
            tipoOrigen: TipoOrigenPuntos.ACTIVIDAD_COMPLETADA,
            origenId: payload.registroTareaEquipoId,
            puntosSnapshot: asignacion.puntos,
            registradoPorId: payload.completadaPorId,
            registradoPorTipo: 'SYSTEM',
            equipoId: payload.equipoId,
          },
        });
      }
    });
  }

  /**
   * Compensación (spec): busca el asiento original por `origenId = registroId`
   * y crea uno nuevo de signo opuesto con `corregidoDeId`. Nunca borra ni
   * edita la fila original. Si el original todavía no llegó (no debería:
   * activity publica por el mismo canal en orden), el error manda el mensaje
   * a reintento y eventualmente a la DLQ — nunca descarte silencioso.
   */
  async procesarConductaRegistroEliminado(
    envelope: EventEnvelope<ConductaRegistroEliminadoPayload>
  ): Promise<void> {
    if (await this.yaProcesado(envelope.eventId)) {
      return;
    }

    const original = await this.prisma.client.eventoPuntos.findFirst({
      where: {
        origenId: envelope.payload.registroId,
        tipoOrigen: TipoOrigenPuntos.CONDUCTA,
        organizacionId: envelope.organizacionId,
      },
    });

    if (!original) {
      throw new Error(
        `No existe EventoPuntos de conducta con origenId ${envelope.payload.registroId} para compensar`
      );
    }

    await this.enTransaccionIdempotente(envelope.eventId, async (tx) => {
      await tx.eventoPuntos.create({
        data: {
          organizacionId: original.organizacionId,
          grupoId: original.grupoId,
          usuarioId: original.usuarioId,
          seccionId: original.seccionId,
          sesionId: original.sesionId,
          tipoOrigen: TipoOrigenPuntos.CORRECCION,
          origenId: original.id,
          puntosSnapshot: -original.puntosSnapshot,
          registradoPorId: envelope.payload.eliminadoPorTutorId,
          registradoPorTipo: 'SYSTEM',
          corregidoDeId: original.id,
          motivoCorreccion: 'Registro de conducta eliminado por un tutor',
        },
      });
    });
  }

  /**
   * Compensa una completada de actividad que un tutor quitó (fase-14): busca el
   * asiento original por `origenId = registroId` (tipoOrigen ACTIVIDAD_COMPLETADA)
   * y crea uno nuevo de signo opuesto con `corregidoDeId`. Mismo patrón exacto
   * que la eliminación de conducta — nunca borra ni edita la fila original.
   */
  async procesarActividadRegistroEliminado(
    envelope: EventEnvelope<ActividadRegistroEliminadoPayload>
  ): Promise<void> {
    if (await this.yaProcesado(envelope.eventId)) {
      return;
    }

    const original = await this.prisma.client.eventoPuntos.findFirst({
      where: {
        origenId: envelope.payload.registroId,
        tipoOrigen: TipoOrigenPuntos.ACTIVIDAD_COMPLETADA,
        organizacionId: envelope.organizacionId,
      },
    });

    if (!original) {
      throw new Error(
        `No existe EventoPuntos de actividad con origenId ${envelope.payload.registroId} para compensar`
      );
    }

    await this.enTransaccionIdempotente(envelope.eventId, async (tx) => {
      await tx.eventoPuntos.create({
        data: {
          organizacionId: original.organizacionId,
          grupoId: original.grupoId,
          usuarioId: original.usuarioId,
          seccionId: original.seccionId,
          sesionId: original.sesionId,
          tipoOrigen: TipoOrigenPuntos.CORRECCION,
          origenId: original.id,
          puntosSnapshot: -original.puntosSnapshot,
          registradoPorId: envelope.payload.eliminadoPorTutorId,
          registradoPorTipo: 'SYSTEM',
          corregidoDeId: original.id,
          motivoCorreccion: 'Completada de actividad quitada por un tutor',
        },
      });
    });
  }

  private async proyectarRegistro(
    envelope: EventEnvelope<unknown>,
    tipoOrigen: TipoOrigenPuntos,
    datos: {
      usuarioId: string;
      seccionId: string;
      sesionId: string;
      origenId: string;
      puntosSnapshot: number;
      registradoPorId: string;
      registradoPorTipo: string;
    }
  ): Promise<void> {
    if (await this.yaProcesado(envelope.eventId)) {
      return;
    }

    const grupoId = this.grupoDelEnvelope(envelope);

    await this.enTransaccionIdempotente(envelope.eventId, async (tx) => {
      await tx.eventoPuntos.create({
        data: {
          organizacionId: envelope.organizacionId,
          grupoId,
          tipoOrigen,
          ...datos,
        },
      });
    });
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

  /**
   * Efecto + marca de procesado en UNA transacción. Una P2002 sobre
   * `EventoProcesado.eventId` es otra entrega concurrente que ganó la
   * carrera: el efecto ya está aplicado, se descarta sin error.
   */
  private async enTransaccionIdempotente(
    eventId: string,
    efecto: (tx: TxProyeccion) => Promise<void>
  ): Promise<void> {
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await efecto(tx);
        await tx.eventoProcesado.create({
          data: { eventId, consumidor: CONSUMIDOR },
        });
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        this.logger.debug(`Evento ${eventId} procesado en paralelo — descartado`);
        return;
      }

      throw error;
    }
  }

  private grupoDelEnvelope(envelope: EventEnvelope<unknown>): string {
    if (!envelope.grupoId) {
      throw new Error(
        `Envelope ${envelope.eventId} (${envelope.eventType}) sin grupoId — no se puede proyectar`
      );
    }

    return envelope.grupoId;
  }
}
