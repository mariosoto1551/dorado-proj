import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import type { EventEnvelope, ZonaAlcanzadaPayload } from '@dorado/shared-events';
import {
  EXCHANGE_DORADO_EVENTS,
  EXCHANGE_DORADO_EVENTS_DLX,
  ROUTING_KEYS,
} from '@dorado/shared-events';
import { correlationStorage } from '@dorado/shared-logging';

import { PrismaService } from '../prisma/prisma.service';

/** Identificador de este consumidor en la tabla EventoProcesado (ADR-00 §5). */
const CONSUMIDOR = 'rewards-service';

/**
 * Forma mínima del mensaje AMQP crudo que necesita el manejo de errores
 * (evita depender directamente de los tipos de `amqplib`).
 */
interface MensajeAmqp {
  fields: { redelivered: boolean };
}

/**
 * Consumidor de `ZonaAlcanzada` (spec fase-08): NO dispara ninguna escritura
 * de negocio — la elegibilidad se calcula al consultar/canjear vía REST a
 * scoring, nunca se precomputa. Los `esEvaluacionFinal=false` se descartan
 * explícitamente (informativos, para Notification); los `=true` se marcan en
 * `EventoProcesado` idempotentemente para dejar la infraestructura de consumo
 * lista por si a futuro se decide precomputar.
 */
@Injectable()
export class ZonasConsumer {
  private readonly logger = new Logger(ZonasConsumer.name);

  constructor(private readonly prisma: PrismaService) {}

  @RabbitSubscribe({
    exchange: EXCHANGE_DORADO_EVENTS,
    routingKey: ROUTING_KEYS.ZONA_ALCANZADA,
    queue: 'rewards.q.zonas-alcanzadas',
    queueOptions: {
      durable: true,
      deadLetterExchange: EXCHANGE_DORADO_EVENTS_DLX,
      arguments: { 'x-queue-type': 'quorum' },
    },
  })
  async onZonaAlcanzada(
    envelope: EventEnvelope<ZonaAlcanzadaPayload>,
    mensaje: MensajeAmqp
  ): Promise<Nack | undefined> {
    try {
      await correlationStorage.run({ correlationId: envelope.correlationId }, () =>
        this.procesar(envelope)
      );

      return undefined;
    } catch (error) {
      const reintentar = !mensaje.fields.redelivered;

      this.logger.error(
        `Error procesando ${envelope.eventType} ${envelope.eventId} (correlationId ${envelope.correlationId}) — ${
          reintentar ? 'reintentando' : 'enviando a rewards.dlq'
        }: ${error instanceof Error ? error.stack : String(error)}`
      );

      return new Nack(reintentar);
    }
  }

  private async procesar(envelope: EventEnvelope<ZonaAlcanzadaPayload>): Promise<void> {
    if (!envelope.payload.esEvaluacionFinal) {
      // Informativo (evaluación intermedia CADA_SESION) — descarte explícito.
      this.logger.debug(
        `ZonaAlcanzada intermedia ${envelope.eventId} descartada (esEvaluacionFinal=false)`
      );

      return;
    }

    try {
      await this.prisma.client.eventoProcesado.create({
        data: { eventId: envelope.eventId, consumidor: CONSUMIDOR },
      });

      this.logger.debug(
        `ZonaAlcanzada final ${envelope.eventId} registrada (usuario ${envelope.payload.usuarioId}, zona ${envelope.payload.nombreZona})`
      );
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        this.logger.debug(`Evento ${envelope.eventId} ya procesado — descartado`);

        return;
      }

      throw error;
    }
  }
}
