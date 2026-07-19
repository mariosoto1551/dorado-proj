import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import type { EventEnvelope } from '@dorado/shared-events';
import {
  EXCHANGE_DORADO_EVENTS,
  EXCHANGE_DORADO_EVENTS_DLX,
  ROUTING_KEYS,
} from '@dorado/shared-events';
import { correlationStorage } from '@dorado/shared-logging';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mapearARegistro } from './mapeo';

/** Identificador de este consumidor en la tabla EventoProcesado (ADR-00 §5). */
const CONSUMIDOR = 'audit-service';

/**
 * Forma mínima del mensaje AMQP crudo que necesita el manejo de errores
 * (evita depender directamente de los tipos de `amqplib`).
 */
interface MensajeAmqp {
  fields: { redelivered: boolean };
}

/**
 * Consumidor único de audit (cola `audit.q.eventos-dominio`): los eventos
 * administrativos/de disputa + los 5 de ciclo de vida de Sesión/Sección
 * (línea de tiempo completa de cada Sección, spec fase-09) + el genérico
 * `*.accion_administrativa` de cualquier productor (wildcard de topic).
 *
 * La ÚNICA escritura de audit ocurre acá: fila + marca EventoProcesado en UNA
 * transacción (reentrega no duplica). La API es de solo lectura por diseño.
 */
@Injectable()
export class AuditoriaConsumer {
  private readonly logger = new Logger(AuditoriaConsumer.name);

  constructor(private readonly prisma: PrismaService) {}

  @RabbitSubscribe({
    exchange: EXCHANGE_DORADO_EVENTS,
    routingKey: [
      ROUTING_KEYS.ORGANIZACION_CREADA,
      ROUTING_KEYS.INVITACION_CANJEADA,
      ROUTING_KEYS.USUARIO_UNIDO,
      ROUTING_KEYS.CONDUCTA_REGISTRO_ELIMINADO,
      ROUTING_KEYS.USUARIO_DESCALIFICADO,
      ROUTING_KEYS.RECOMPENSA_CANJEADA,
      ROUTING_KEYS.SESION_ABIERTA,
      ROUTING_KEYS.SESION_CERRADA,
      ROUTING_KEYS.SECCION_ABIERTA,
      ROUTING_KEYS.SECCION_ENTRO_EVALUACION,
      ROUTING_KEYS.SECCION_CERRADA,
      // `<servicio>.accion_administrativa` de cualquier productor (ADR-00 §5).
      '*.accion_administrativa',
    ],
    queue: 'audit.q.eventos-dominio',
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
          reintentar ? 'reintentando' : 'enviando a audit.dlq'
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

    const fila = mapearARegistro(envelope);

    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.registroAuditoria.create({
          data: { ...fila, detalle: fila.detalle as Prisma.InputJsonValue },
        });
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
  }
}
