import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import type { EventEnvelope, SesionEventoPayload } from '@dorado/shared-events';
import {
  EXCHANGE_DORADO_EVENTS,
  EXCHANGE_DORADO_EVENTS_DLX,
  ROUTING_KEYS,
} from '@dorado/shared-events';
import { correlationStorage } from '@dorado/shared-logging';

import { SelladoTurnosService } from '../turnos/sellado-turnos.service';
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

  constructor(
    private readonly cierre: CierreService,
    private readonly sellado: SelladoTurnosService
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGE_DORADO_EVENTS,
    // fase-14-21: la misma cola pasa a escuchar también la APERTURA, para sellar
    // el turno del día. Se suma la routing key al binding existente — sin cola
    // nueva y sin cambiar las opciones, así que no hay nada que redeclarar.
    routingKey: [ROUTING_KEYS.SESION_CERRADA, ROUTING_KEYS.SESION_ABIERTA],
    queue: 'activity.q.sesiones',
    queueOptions: OPCIONES_COLA,
  })
  async onEventoDeSesion(
    envelope: EventEnvelope<SesionEventoPayload>,
    mensaje: MensajeAmqp
  ): Promise<Nack | undefined> {
    const esApertura = envelope.eventType === 'SesionAbierta';

    try {
      // Scope de correlación del evento entrante (ADR-00 §5): lo que salga de
      // acá comparte el correlationId del evento de sesión originante.
      await correlationStorage.run({ correlationId: envelope.correlationId }, () =>
        esApertura
          ? this.sellado.procesarSesionAbierta(envelope)
          : this.cierre.procesarSesionCerrada(envelope)
      );

      return undefined;
    } catch (error) {
      const reintentar = !mensaje.fields.redelivered;

      this.logger.error(
        `Error procesando ${envelope.eventType} ${envelope.eventId} (correlationId ${envelope.correlationId}) — ${
          reintentar ? 'reintentando' : 'enviando a activity.dlq'
        }: ${error instanceof Error ? error.stack : String(error)}`
      );

      return new Nack(reintentar);
    }
  }
}
