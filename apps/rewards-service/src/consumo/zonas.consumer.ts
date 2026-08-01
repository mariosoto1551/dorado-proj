import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import type {
  EventEnvelope,
  MonedasAcreditadasPayload,
  ZonaAlcanzadaPayload,
} from '@dorado/shared-events';
import {
  EXCHANGE_DORADO_EVENTS,
  EXCHANGE_DORADO_EVENTS_DLX,
  ROUTING_KEYS,
} from '@dorado/shared-events';
import { correlationStorage } from '@dorado/shared-logging';
import { ModoRecompensas } from '@dorado/shared-types';

import { CierreEconomicoService } from '../cierre/cierre-economico.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
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
 * Consumidor de `ZonaAlcanzada`. Los `esEvaluacionFinal=false` se descartan
 * explícitamente (informativos, para Notification). Con los `=true`, el
 * comportamiento depende del modo del Grupo:
 *
 * - `DIRECTO` (spec fase-08, default): NO dispara ninguna escritura de negocio
 *   — la elegibilidad se calcula al consultar/canjear vía REST a scoring,
 *   nunca se precomputa. Solo se marca en `EventoProcesado`.
 * - `TIENDA` (fase-14-22): corre el **cierre económico** — acredita el
 *   rendimiento de la zona y, si el saldo queda negativo, la bancarrota.
 *
 * Es decir: un grupo en DIRECTO se comporta EXACTAMENTE como antes de este ítem.
 */
@Injectable()
export class ZonasConsumer {
  private readonly logger = new Logger(ZonasConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
    private readonly cierre: CierreEconomicoService,
    private readonly eventos: EventosPublisherService
  ) {}

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

    const modo = await this.configuracion.obtenerModo(envelope.payload.grupoId);

    if (modo === ModoRecompensas.TIENDA) {
      await this.correrCierreEconomico(envelope);

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

  /**
   * El cierre marca `EventoProcesado` DENTRO de su propia transacción, junto
   * con los movimientos: acá no se marca nada aparte. La publicación va después
   * de que la transacción cerró — publicar adentro dejaría avisado un cobro que
   * todavía puede hacer rollback.
   */
  private async correrCierreEconomico(
    envelope: EventEnvelope<ZonaAlcanzadaPayload>
  ): Promise<void> {
    const resultado = await this.cierre.aplicar(
      envelope.eventId,
      CONSUMIDOR,
      envelope.payload
    );

    if (!resultado) {
      return;
    }

    await this.eventos.publicar<MonedasAcreditadasPayload>({
      eventType: 'MonedasAcreditadas',
      routingKey: ROUTING_KEYS.MONEDAS_ACREDITADAS,
      organizacionId: envelope.payload.organizacionId,
      grupoId: envelope.payload.grupoId,
      payload: {
        usuarioId: envelope.payload.usuarioId,
        organizacionId: envelope.payload.organizacionId,
        grupoId: envelope.payload.grupoId,
        seccionId: envelope.payload.seccionId,
        nombreZona: envelope.payload.nombreZona,
        monedas: resultado.monedas,
        saldoResultante: resultado.saldoResultante,
        castigo: resultado.castigo,
      },
    });

    this.logger.log(
      `Cierre económico de ${envelope.payload.usuarioId} en ${envelope.payload.seccionId}: ${resultado.monedas} monedas, saldo ${resultado.saldoResultante}${
        resultado.castigo ? `, castigo "${resultado.castigo.nombre}"` : ''
      }`
    );
  }
}
