import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import {
  EventEnvelope,
  EXCHANGE_DORADO_EVENTS,
  EXCHANGE_DORADO_EVENTS_DLX,
  OrganizacionCreadaPayload,
  ROUTING_KEYS,
} from '@dorado/shared-events';

import { SuscripcionesService } from './suscripciones.service';

/**
 * Forma mínima del mensaje AMQP crudo que necesita el manejo de errores
 * (evita depender directamente de los tipos de `amqplib`, que es una
 * dependencia transitiva de @golevelup/nestjs-rabbitmq).
 */
interface MensajeAmqp {
  fields: { redelivered: boolean };
}

/**
 * Consumidor de `OrganizacionCreada` (event-catalog: Billing crea la
 * Suscripción FREE). Primer consumidor de eventos del monorepo — topología
 * según ADR-00 §5: cola cuórum propia bindeada a `dorado.events`, con DLX.
 *
 * Manejo de fallas: un error en el procesamiento reintenta UNA vez (requeue
 * inmediato); si el mensaje ya venía reentregado, va a la DLQ (`billing.dlq`)
 * para revisión manual — nunca se descarta silenciosamente. La idempotencia
 * por `EventoProcesado` hace seguro cualquier reintento.
 */
@Injectable()
export class SuscripcionesConsumer {
  private readonly logger = new Logger(SuscripcionesConsumer.name);

  constructor(private readonly suscripciones: SuscripcionesService) {}

  @RabbitSubscribe({
    exchange: EXCHANGE_DORADO_EVENTS,
    routingKey: ROUTING_KEYS.ORGANIZACION_CREADA,
    queue: 'billing.q.suscripciones',
    queueOptions: {
      durable: true,
      deadLetterExchange: EXCHANGE_DORADO_EVENTS_DLX,
      arguments: { 'x-queue-type': 'quorum' },
    },
  })
  async onOrganizacionCreada(
    envelope: EventEnvelope<OrganizacionCreadaPayload>,
    mensaje: MensajeAmqp
  ): Promise<Nack | undefined> {
    try {
      await this.suscripciones.procesarOrganizacionCreada(envelope);

      return undefined;
    } catch (error) {
      const reintentar = !mensaje.fields.redelivered;
      this.logger.error(
        `Error procesando ${envelope.eventType} ${envelope.eventId} (correlationId ${envelope.correlationId}) — ${
          reintentar ? 'reintentando' : 'enviando a billing.dlq'
        }: ${error instanceof Error ? error.stack : String(error)}`
      );

      return new Nack(reintentar);
    }
  }
}
