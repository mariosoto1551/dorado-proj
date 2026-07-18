import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { EventEnvelope, EXCHANGE_DORADO_EVENTS } from '@dorado/shared-events';
import { getCorrelationId } from '@dorado/shared-logging';

export interface EventoAPublicar<T> {
  /** ej. 'ActividadCompletada' */
  eventType: string;
  /** usar las constantes de ROUTING_KEYS de @dorado/shared-events */
  routingKey: string;
  organizacionId: string;
  grupoId?: string;
  payload: T;
}

/**
 * Publicador de eventos de dominio de activity-service. Envuelve SIEMPRE el
 * payload en el `EventEnvelope` estándar (ADR-00 §5) — nunca publicar un
 * payload "pelado": rompe idempotencia y trazabilidad de los consumidores.
 *
 * Todos los eventos de esta fase nacen de un request HTTP, así que el
 * correlationId sale del scope abierto por el middleware de correlación.
 */
@Injectable()
export class EventosPublisherService {
  private static readonly PRODUCTOR = 'activity-service';

  constructor(private readonly amqp: AmqpConnection) {}

  async publicar<T>(evento: EventoAPublicar<T>): Promise<void> {
    const envelope: EventEnvelope<T> = {
      eventId: randomUUID(),
      eventType: evento.eventType,
      producedBy: EventosPublisherService.PRODUCTOR,
      organizacionId: evento.organizacionId,
      grupoId: evento.grupoId,
      occurredAt: new Date().toISOString(),
      correlationId: getCorrelationId() ?? randomUUID(),
      payload: evento.payload,
    };

    await this.amqp.publish(EXCHANGE_DORADO_EVENTS, evento.routingKey, envelope, {
      persistent: true,
    });
  }
}
