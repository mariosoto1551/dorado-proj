import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import type { EventEnvelope } from '@dorado/shared-events';
import {
  EXCHANGE_DORADO_EVENTS,
  EXCHANGE_DORADO_EVENTS_DLX,
  ROUTING_KEYS,
} from '@dorado/shared-events';
import { correlationStorage } from '@dorado/shared-logging';

import { PrismaService } from '../prisma/prisma.service';
import { PlantillasService } from './plantillas.service';

/** Identificador de este consumidor en la tabla EventoProcesado (ADR-00 §5). */
const CONSUMIDOR = 'notification-service';

/**
 * Forma mínima del mensaje AMQP crudo que necesita el manejo de errores
 * (evita depender directamente de los tipos de `amqplib`).
 */
interface MensajeAmqp {
  fields: { redelivered: boolean };
}

/**
 * Consumidor único de notification (cola `notification.q.eventos-dominio`,
 * nombre del ejemplo de ADR-00 §5): los 9 eventos notificables de la tabla de
 * la spec fase-09, despachados por eventType en PlantillasService.
 *
 * Idempotencia: las filas de Notificacion y la marca EventoProcesado se
 * escriben en UNA transacción — una reentrega no duplica notificaciones.
 * Los REST de nombres/destinatarios corren ANTES de la transacción (nunca
 * red adentro de una tx). Manejo de fallas: reintento único → notification.dlq.
 */
@Injectable()
export class NotificacionesConsumer {
  private readonly logger = new Logger(NotificacionesConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plantillas: PlantillasService
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGE_DORADO_EVENTS,
    routingKey: [
      ROUTING_KEYS.INVITACION_GENERADA,
      ROUTING_KEYS.USUARIO_UNIDO,
      ROUTING_KEYS.NO_HIZO_REGISTRADO,
      ROUTING_KEYS.CONDUCTA_REGISTRADA,
      ROUTING_KEYS.CONDUCTA_REGISTRO_ELIMINADO,
      ROUTING_KEYS.SECCION_ENTRO_EVALUACION,
      ROUTING_KEYS.ZONA_ALCANZADA,
      ROUTING_KEYS.USUARIO_DESCALIFICADO,
      ROUTING_KEYS.RECOMPENSA_CANJEADA,
      ROUTING_KEYS.REPORTE_MIEMBRO_CREADO,
      ROUTING_KEYS.ACTIVIDAD_PROPUESTA_CREADA,
      ROUTING_KEYS.ACTIVIDAD_PROPUESTA_RESUELTA,
    ],
    queue: 'notification.q.eventos-dominio',
    queueOptions: {
      durable: true,
      deadLetterExchange: EXCHANGE_DORADO_EVENTS_DLX,
      arguments: { 'x-queue-type': 'quorum' },
    },
  })
  async onEvento(
    envelope: EventEnvelope<unknown>,
    mensaje: MensajeAmqp
  ): Promise<Nack | undefined> {
    try {
      // Scope de correlación del evento entrante (ADR-00 §5).
      await correlationStorage.run({ correlationId: envelope.correlationId }, () =>
        this.procesar(envelope)
      );

      return undefined;
    } catch (error) {
      const reintentar = !mensaje.fields.redelivered;

      this.logger.error(
        `Error procesando ${envelope.eventType} ${envelope.eventId} (correlationId ${envelope.correlationId}) — ${
          reintentar ? 'reintentando' : 'enviando a notification.dlq'
        }: ${error instanceof Error ? error.stack : String(error)}`
      );

      return new Nack(reintentar);
    }
  }

  private async procesar(envelope: EventEnvelope<unknown>): Promise<void> {
    const yaProcesado = await this.prisma.client.eventoProcesado.findUnique({
      where: { eventId: envelope.eventId },
    });

    if (yaProcesado) {
      this.logger.debug(`Evento ${envelope.eventId} ya procesado — descartado`);

      return;
    }

    // REST de destinatarios/nombres ANTES de la transacción.
    const filas = await this.plantillas.armar(envelope);

    try {
      await this.prisma.client.$transaction(async (tx) => {
        if (filas.length > 0) {
          await tx.notificacion.createMany({ data: filas });
        }

        await tx.eventoProcesado.create({
          data: { eventId: envelope.eventId, consumidor: CONSUMIDOR },
        });
      });
    } catch (error) {
      // P2002 en eventId: otra entrega concurrente ganó — ya está aplicado.
      if ((error as { code?: string })?.code === 'P2002') {
        this.logger.debug(`Evento ${envelope.eventId} procesado en paralelo — descartado`);

        return;
      }

      throw error;
    }

    if (filas.length > 0) {
      this.logger.debug(
        `${filas.length} notificación(es) creadas por ${envelope.eventType} ${envelope.eventId}`
      );
    }
  }
}
