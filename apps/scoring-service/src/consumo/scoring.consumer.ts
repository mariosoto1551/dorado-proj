import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import type {
  ActividadCompletadaPayload,
  ActividadRegistroEliminadoPayload,
  ConductaRegistradaPayload,
  ConductaRegistroEliminadoPayload,
  EventEnvelope,
  NoHizoRegistradoPayload,
  SeccionEventoPayload,
  SesionEventoPayload,
  TareaEquipoCompletadaPayload,
} from '@dorado/shared-events';
import {
  EXCHANGE_DORADO_EVENTS,
  EXCHANGE_DORADO_EVENTS_DLX,
  ROUTING_KEYS,
} from '@dorado/shared-events';
import { correlationStorage } from '@dorado/shared-logging';

import { EvaluacionService } from './evaluacion.service';
import { ProyeccionService } from './proyeccion.service';

/**
 * Forma mínima del mensaje AMQP crudo que necesita el manejo de errores
 * (evita depender directamente de los tipos de `amqplib`).
 */
interface MensajeAmqp {
  fields: { redelivered: boolean };
}

const OPCIONES_COLA = {
  durable: true,
  deadLetterExchange: EXCHANGE_DORADO_EVENTS_DLX,
  arguments: { 'x-queue-type': 'quorum' },
};

/**
 * Consumidores de scoring (spec fase-07). DOS colas cuórum, no una por
 * evento, a propósito:
 *
 * - `scoring.q.registros-actividad` (nombre de ADR-00 §5): los 4 eventos de
 *   registro de activity.
 * - `scoring.q.sesiones`: SesionCerrada + SeccionEntroEvaluacion. Compartir
 *   cola preserva el ORDEN de publicación de session-service — en el tick del
 *   lunes 00:00 de Destino:Dorado, SesionCerrada llega y se procesa ANTES que
 *   SeccionEntroEvaluacion (nota de docs/progreso/fase-06), cosa que colas
 *   separadas no garantizarían.
 *
 * Cada handler despacha por `eventType` y corre dentro del scope de
 * correlación del envelope: los logs y los ZonaAlcanzada que salgan comparten
 * el correlationId del registro que originó la cadena (ADR-00 §5).
 *
 * Manejo de fallas (mismo criterio que billing fase-04): un error reintenta
 * UNA vez (requeue inmediato); si el mensaje ya venía reentregado, va a
 * `scoring.dlq` para revisión manual — nunca descarte silencioso. La
 * idempotencia por `EventoProcesado` hace seguro cualquier reintento.
 */
@Injectable()
export class ScoringConsumer {
  private readonly logger = new Logger(ScoringConsumer.name);

  constructor(
    private readonly proyeccion: ProyeccionService,
    private readonly evaluacion: EvaluacionService
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGE_DORADO_EVENTS,
    routingKey: [
      ROUTING_KEYS.ACTIVIDAD_COMPLETADA,
      ROUTING_KEYS.NO_HIZO_REGISTRADO,
      ROUTING_KEYS.CONDUCTA_REGISTRADA,
      ROUTING_KEYS.CONDUCTA_REGISTRO_ELIMINADO,
      ROUTING_KEYS.ACTIVIDAD_REGISTRO_ELIMINADO,
      ROUTING_KEYS.TAREA_EQUIPO_COMPLETADA,
    ],
    queue: 'scoring.q.registros-actividad',
    queueOptions: OPCIONES_COLA,
  })
  async onRegistro(
    envelope: EventEnvelope<unknown>,
    mensaje: MensajeAmqp
  ): Promise<Nack | undefined> {
    return await this.procesar(envelope, mensaje, async () => {
      switch (envelope.eventType) {
        case 'ActividadCompletada':
          await this.proyeccion.procesarActividadCompletada(
            envelope as EventEnvelope<ActividadCompletadaPayload>
          );
          break;
        case 'NoHizoRegistrado':
          await this.proyeccion.procesarNoHizoRegistrado(
            envelope as EventEnvelope<NoHizoRegistradoPayload>
          );
          break;
        case 'ConductaRegistrada':
          await this.proyeccion.procesarConductaRegistrada(
            envelope as EventEnvelope<ConductaRegistradaPayload>
          );
          break;
        case 'ConductaRegistroEliminado':
          await this.proyeccion.procesarConductaRegistroEliminado(
            envelope as EventEnvelope<ConductaRegistroEliminadoPayload>
          );
          break;
        case 'ActividadRegistroEliminado':
          await this.proyeccion.procesarActividadRegistroEliminado(
            envelope as EventEnvelope<ActividadRegistroEliminadoPayload>
          );
          break;
        case 'TareaEquipoCompletada':
          await this.proyeccion.procesarTareaEquipoCompletada(
            envelope as EventEnvelope<TareaEquipoCompletadaPayload>
          );
          break;
        default:
          throw new TipoInesperadoError(envelope.eventType);
      }
    });
  }

  @RabbitSubscribe({
    exchange: EXCHANGE_DORADO_EVENTS,
    routingKey: [ROUTING_KEYS.SESION_CERRADA, ROUTING_KEYS.SECCION_ENTRO_EVALUACION],
    queue: 'scoring.q.sesiones',
    queueOptions: OPCIONES_COLA,
  })
  async onSesion(
    envelope: EventEnvelope<unknown>,
    mensaje: MensajeAmqp
  ): Promise<Nack | undefined> {
    return await this.procesar(envelope, mensaje, async () => {
      switch (envelope.eventType) {
        case 'SesionCerrada':
          await this.evaluacion.procesarSesionCerrada(
            envelope as EventEnvelope<SesionEventoPayload>
          );
          break;
        case 'SeccionEntroEvaluacion':
          await this.evaluacion.procesarSeccionEntroEvaluacion(
            envelope as EventEnvelope<SeccionEventoPayload>
          );
          break;
        default:
          throw new TipoInesperadoError(envelope.eventType);
      }
    });
  }

  private async procesar(
    envelope: EventEnvelope<unknown>,
    mensaje: MensajeAmqp,
    efecto: () => Promise<void>
  ): Promise<Nack | undefined> {
    try {
      // Scope de correlación del evento entrante (ADR-00 §5): logs y eventos
      // publicados desde acá comparten el correlationId del originante.
      await correlationStorage.run({ correlationId: envelope.correlationId }, efecto);

      return undefined;
    } catch (error) {
      // Un eventType que no corresponde a esta cola no se reintenta: es un
      // problema de topología, directo a la DLQ para revisión.
      const reintentar =
        !(error instanceof TipoInesperadoError) && !mensaje.fields.redelivered;

      this.logger.error(
        `Error procesando ${envelope.eventType} ${envelope.eventId} (correlationId ${envelope.correlationId}) — ${
          reintentar ? 'reintentando' : 'enviando a scoring.dlq'
        }: ${error instanceof Error ? error.stack : String(error)}`
      );

      return new Nack(reintentar);
    }
  }
}

class TipoInesperadoError extends Error {
  constructor(eventType: string) {
    super(`eventType inesperado en cola de scoring: ${eventType}`);
  }
}
