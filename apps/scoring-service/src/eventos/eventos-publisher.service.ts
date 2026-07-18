import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { EventEnvelope, EXCHANGE_DORADO_EVENTS } from '@dorado/shared-events';
import { getCorrelationId } from '@dorado/shared-logging';

export interface EventoAPublicar<T> {
  /** ej. 'ZonaAlcanzada' */
  eventType: string;
  /** usar las constantes de ROUTING_KEYS de @dorado/shared-events */
  routingKey: string;
  organizacionId: string;
  grupoId?: string;
  payload: T;
}

/**
 * Publicador de eventos de dominio de scoring-service. Envuelve SIEMPRE el
 * payload en el `EventEnvelope` estándar (ADR-00 §5) — nunca publicar un
 * payload "pelado": rompe idempotencia y trazabilidad de los consumidores.
 *
 * El correlationId sale del scope activo: el del request HTTP (descalificar)
 * o el del evento consumido que originó la evaluación (los consumidores abren
 * scope con el correlationId del envelope entrante — la cadena
 * registro → evaluación → ZonaAlcanzada comparte un solo correlationId).
 */
@Injectable()
export class EventosPublisherService {
  private static readonly PRODUCTOR = 'scoring-service';

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

  /** Publica en orden, uno por uno (una ZonaAlcanzada por usuario evaluado). */
  async publicarTodos(eventos: EventoAPublicar<unknown>[]): Promise<void> {
    for (const evento of eventos) {
      await this.publicar(evento);
    }
  }
}
