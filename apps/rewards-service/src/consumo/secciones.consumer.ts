import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import type { EventEnvelope, SeccionEventoPayload } from '@dorado/shared-events';
import {
  EXCHANGE_DORADO_EVENTS,
  EXCHANGE_DORADO_EVENTS_DLX,
  ROUTING_KEYS,
} from '@dorado/shared-events';
import { correlationStorage } from '@dorado/shared-logging';

import { ConfiguracionService } from '../configuracion/configuracion.service';
import { PrismaService } from '../prisma/prisma.service';

/** Identificador de este consumidor en la tabla EventoProcesado (ADR-00 §5). */
const CONSUMIDOR = 'rewards-service.secciones';

/**
 * Forma mínima del mensaje AMQP crudo que necesita el manejo de errores
 * (evita depender directamente de los tipos de `amqplib`).
 */
interface MensajeAmqp {
  fields: { redelivered: boolean };
}

/**
 * Consumidor de `SeccionAbierta` (spec fase-14-22 Parte B.3): aplica el cambio
 * de modo de recompensas que el Tutor dejó diferido (decisión 9). Es el único
 * efecto de este consumidor — un grupo sin `modoPendiente` no cambia en nada.
 */
@Injectable()
export class SeccionesConsumer {
  private readonly logger = new Logger(SeccionesConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGE_DORADO_EVENTS,
    routingKey: ROUTING_KEYS.SECCION_ABIERTA,
    queue: 'rewards.q.secciones',
    queueOptions: {
      durable: true,
      deadLetterExchange: EXCHANGE_DORADO_EVENTS_DLX,
      arguments: { 'x-queue-type': 'quorum' },
    },
  })
  async onSeccionAbierta(
    envelope: EventEnvelope<SeccionEventoPayload>,
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

  private async procesar(envelope: EventEnvelope<SeccionEventoPayload>): Promise<void> {
    const yaProcesado = await this.prisma.client.eventoProcesado.findUnique({
      where: { eventId: envelope.eventId },
    });

    if (yaProcesado) {
      this.logger.debug(`Evento ${envelope.eventId} ya procesado — descartado`);

      return;
    }

    // El efecto se aplica ANTES de marcar, al revés que en `zonas.consumer`.
    // Acá se puede: aplicar el pendiente es idempotente por construcción (deja
    // `modoPendiente` en null), así que una reentrega no hace daño. Si se
    // marcara primero y el proceso muriera en el medio, en cambio, el cambio
    // de modo quedaría pendiente hasta la Sección SIGUIENTE.
    const modoAplicado = await this.configuracion.aplicarModoPendiente(
      envelope.payload.grupoId
    );

    try {
      await this.prisma.client.eventoProcesado.create({
        data: { eventId: envelope.eventId, consumidor: CONSUMIDOR },
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') {
        throw error;
      }
    }

    if (modoAplicado) {
      this.logger.log(
        `SeccionAbierta ${envelope.payload.seccionId}: modo de recompensas del grupo ${envelope.payload.grupoId} pasó a ${modoAplicado}`
      );
    }
  }
}
