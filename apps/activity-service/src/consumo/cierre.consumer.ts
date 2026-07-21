import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import type { EventEnvelope, SesionEventoPayload } from '@dorado/shared-events';
import {
  EXCHANGE_DORADO_EVENTS,
  EXCHANGE_DORADO_EVENTS_DLX,
  ROUTING_KEYS,
} from '@dorado/shared-events';
import { correlationStorage } from '@dorado/shared-logging';

import { CierreService } from './cierre.service';

/** Forma mínima del mensaje AMQP crudo necesaria para el manejo de errores. */
interface MensajeAmqp {
  fields: { redelivered: boolean };
}

const OPCIONES_COLA = {
  durable: true,
  deadLetterExchange: EXCHANGE_DORADO_EVENTS_DLX,
  arguments: { 'x-queue-type': 'quorum' },
};

/**
 * Primer consumidor de eventos de activity-service (fase-14-08): hasta ahora
 * era productor puro. Cola cuórum propia suscrita a `session.sesion_cerrada`
 * para aplicar el castigo automático de obligatorias no confirmadas.
 *
 * Manejo de fallas idéntico a scoring (fase-07): un error reintenta UNA vez
 * (requeue); si el mensaje ya venía reentregado, va a la DLQ — nunca descarte
 * silencioso. La idempotencia por `EventoProcesado` hace seguro el reintento.
 */
@Injectable()
export class CierreConsumer {
  private readonly logger = new Logger(CierreConsumer.name);

  constructor(private readonly cierre: CierreService) {}

  @RabbitSubscribe({
    exchange: EXCHANGE_DORADO_EVENTS,
    routingKey: [ROUTING_KEYS.SESION_CERRADA],
    queue: 'activity.q.sesiones',
    queueOptions: OPCIONES_COLA,
  })
  async onSesionCerrada(
    envelope: EventEnvelope<SesionEventoPayload>,
    mensaje: MensajeAmqp
  ): Promise<Nack | undefined> {
    try {
      // Scope de correlación del evento entrante (ADR-00 §5): los NoHizo que
      // salgan de acá comparten el correlationId del SesionCerrada originante.
      await correlationStorage.run({ correlationId: envelope.correlationId }, () =>
        this.cierre.procesarSesionCerrada(envelope)
      );

      return undefined;
    } catch (error) {
      const reintentar = !mensaje.fields.redelivered;

      this.logger.error(
        `Error procesando SesionCerrada ${envelope.eventId} (correlationId ${envelope.correlationId}) — ${
          reintentar ? 'reintentando' : 'enviando a activity.dlq'
        }: ${error instanceof Error ? error.stack : String(error)}`
      );

      return new Nack(reintentar);
    }
  }
}
