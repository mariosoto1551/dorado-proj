import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import type {
  ActividadCompletadaPayload,
  ActividadRegistroEliminadoPayload,
  ActividadRegistroRevertidoPayload,
  ConductaRegistradaPayload,
  ConductaRegistroEliminadoPayload,
  EventEnvelope,
  MonedasPorAccionPayload,
  TareaEquipoCompletadaPayload,
  TareaEquipoMarcaPayload,
} from '@dorado/shared-events';
import {
  EXCHANGE_DORADO_EVENTS,
  EXCHANGE_DORADO_EVENTS_DLX,
  ROUTING_KEYS,
} from '@dorado/shared-events';
import { correlationStorage } from '@dorado/shared-logging';
import { ModoRecompensas, TipoAccionRendimiento } from '@dorado/shared-types';

import {
  MonedasPorAccionService,
  type AcreditacionAccion,
  type DatosAcreditacion,
} from '../acciones/monedas-por-accion.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { PrismaService } from '../prisma/prisma.service';

/** Identificador de este consumidor en la tabla EventoProcesado (ADR-00 §5). */
const CONSUMIDOR = 'rewards-service.acciones';

/** Cola propia (cuórum, con DLX) — las ocho routing keys de la Parte B. */
const COLA = 'rewards.q.acciones';

const OPCIONES_COLA = {
  durable: true,
  deadLetterExchange: EXCHANGE_DORADO_EVENTS_DLX,
  arguments: { 'x-queue-type': 'quorum' as const },
};

/**
 * Forma mínima del mensaje AMQP crudo que necesita el manejo de errores
 * (evita depender directamente de los tipos de `amqplib`).
 */
interface MensajeAmqp {
  fields: { redelivered: boolean };
}

/**
 * LA SEGUNDA FUENTE DE LA ECONOMÍA, del lado de los eventos (spec fase-14-28,
 * Parte B). Cuatro hechos pagan monedas y ninguno más (decisión 3): completar
 * una opcional, confirmar una obligatoria, completar una tarea de equipo y
 * registrar una conducta BUENA. Los otros cuatro eventos son el camino de
 * corrección: quitar la marca (con piso en 0) y deshacer esa quita.
 *
 * EN MODO `DIRECTO` NO SE ESCRIBE NADA (decisión 14): se chequea el modo, se
 * marca `EventoProcesado` y se sale — exactamente como hace `ZonasConsumer`. Un
 * grupo en DIRECTO, que es el default, se comporta igual que antes del ítem.
 */
@Injectable()
export class AccionesConsumer {
  private readonly logger = new Logger(AccionesConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
    private readonly monedas: MonedasPorAccionService,
    private readonly eventos: EventosPublisherService
  ) {}

  /**
   * UN SOLO handler para las ocho routing keys, con `switch` por `eventType` —
   * el mismo patrón que `ScoringConsumer.onRegistro`, y NO ocho
   * `@RabbitSubscribe` sobre la misma cola.
   *
   * POR QUÉ IMPORTA (lo encontró la E2E, no la unidad): ocho suscripciones
   * sobre una misma cola registran ocho consumidores AMQP contra ella, y
   * RabbitMQ reparte los mensajes entre ellos **round-robin, ignorando la
   * routing key con la que cada uno se dio de alta**. Un `ActividadCompletada`
   * caía en el handler de tareas de equipo y explotaba en
   * `payload.asignaciones.map`. Los unit tests no lo ven porque llaman a cada
   * método directamente: ahí el ruteo lo hace el test, no RabbitMQ.
   */
  @RabbitSubscribe({
    exchange: EXCHANGE_DORADO_EVENTS,
    routingKey: [
      ROUTING_KEYS.ACTIVIDAD_COMPLETADA,
      ROUTING_KEYS.CONDUCTA_REGISTRADA,
      ROUTING_KEYS.TAREA_EQUIPO_COMPLETADA,
      ROUTING_KEYS.ACTIVIDAD_REGISTRO_ELIMINADO,
      ROUTING_KEYS.CONDUCTA_REGISTRO_ELIMINADO,
      ROUTING_KEYS.TAREA_EQUIPO_ANULADA,
      ROUTING_KEYS.ACTIVIDAD_REGISTRO_REVERTIDO,
      ROUTING_KEYS.TAREA_EQUIPO_REVERTIDA,
    ],
    queue: COLA,
    queueOptions: OPCIONES_COLA,
  })
  async onRegistro(
    envelope: EventEnvelope<unknown>,
    mensaje: MensajeAmqp
  ): Promise<Nack | undefined> {
    return await this.manejar(envelope, mensaje, () => this.despachar(envelope));
  }

  private async despachar(envelope: EventEnvelope<unknown>): Promise<void> {
    switch (envelope.eventType) {
      // ── acreditación (B.1): los cuatro hechos que pagan ──
      case 'ActividadCompletada':
        return await this.porActividadCompletada(
          envelope as EventEnvelope<ActividadCompletadaPayload>
        );
      case 'ConductaRegistrada':
        return await this.porConductaRegistrada(
          envelope as EventEnvelope<ConductaRegistradaPayload>
        );
      case 'TareaEquipoCompletada':
        return await this.porTareaEquipoCompletada(
          envelope as EventEnvelope<TareaEquipoCompletadaPayload>
        );

      // ── reversión y restitución (B.2) ──
      case 'ActividadRegistroEliminado':
        return await this.revertir(
          envelope,
          (envelope as EventEnvelope<ActividadRegistroEliminadoPayload>).payload.registroId
        );
      case 'ConductaRegistroEliminado':
        return await this.revertir(
          envelope,
          (envelope as EventEnvelope<ConductaRegistroEliminadoPayload>).payload.registroId
        );
      // Revierte a CADA miembro que cobró, no solo al jefe: el reparto son N
      // movimientos con el mismo origenId y compensar uno dejaría la mitad de
      // las billeteras mal en silencio (la advertencia que dejó fase-14-13).
      case 'TareaEquipoAnulada':
        return await this.revertir(
          envelope,
          (envelope as EventEnvelope<TareaEquipoMarcaPayload>).payload.registroTareaEquipoId
        );
      case 'ActividadRegistroRevertido':
        return await this.porActividadRegistroRevertido(
          envelope as EventEnvelope<ActividadRegistroRevertidoPayload>
        );
      case 'TareaEquipoRevertida':
        return await this.restituir(
          envelope,
          (envelope as EventEnvelope<TareaEquipoMarcaPayload>).payload.registroTareaEquipoId
        );

      default:
        // Nunca debería pasar: la cola está bindeada a ocho routing keys y
        // están las ocho arriba. Si aparece, es un binding que quedó suelto —
        // se falla ruidosamente en vez de descartar en silencio.
        throw new Error(
          `AccionesConsumer no sabe procesar ${envelope.eventType} (evento ${envelope.eventId})`
        );
    }
  }

  private async porActividadCompletada(
    envelope: EventEnvelope<ActividadCompletadaPayload>
  ): Promise<void> {
    await this.acreditar(envelope, {
      organizacionId: envelope.organizacionId,
      grupoId: this.grupoDe(envelope),
      seccionId: envelope.payload.seccionId,
      tipoAccion: TipoAccionRendimiento.ACTIVIDAD,
      origenId: envelope.payload.actividadId,
      registroId: envelope.payload.registroId,
      miembros: [{ usuarioId: envelope.payload.usuarioId, esJefe: false }],
    });
  }

  private async porConductaRegistrada(
    envelope: EventEnvelope<ConductaRegistradaPayload>
  ): Promise<void> {
    // Decisión 4: lo que se hace nunca debita. Una MALA no paga y tampoco
    // resta — descarte explícito, no un `if` escondido en el service.
    if (envelope.payload.tipo !== 'BUENA') {
      this.logger.debug(
        `ConductaRegistrada ${envelope.eventId} es MALA — no paga monedas (decisión 4)`
      );

      await this.marcarProcesado(envelope.eventId);

      return;
    }

    await this.acreditar(envelope, {
      organizacionId: envelope.organizacionId,
      grupoId: this.grupoDe(envelope),
      seccionId: envelope.payload.seccionId,
      tipoAccion: TipoAccionRendimiento.CONDUCTA,
      origenId: envelope.payload.conductaId,
      registroId: envelope.payload.registroId,
      miembros: [{ usuarioId: envelope.payload.usuarioId, esJefe: false }],
    });
  }

  private async porTareaEquipoCompletada(
    envelope: EventEnvelope<TareaEquipoCompletadaPayload>
  ): Promise<void> {
    // Decisión 8: las monedas COMPLETAS a cada miembro (no se divide, igual
    // que el puntaje) y un bono propio al jefe.
    await this.acreditar(
      envelope,
      {
        organizacionId: envelope.payload.organizacionId,
        grupoId: envelope.payload.grupoId,
        seccionId: envelope.payload.seccionId,
        tipoAccion: TipoAccionRendimiento.ACTIVIDAD,
        origenId: envelope.payload.actividadId,
        registroId: envelope.payload.registroTareaEquipoId,
        miembros: envelope.payload.asignaciones.map((asignacion) => ({
          usuarioId: asignacion.usuarioId,
          esJefe: asignacion.esJefe,
        })),
      },
      true
    );
  }

  private async porActividadRegistroRevertido(
    envelope: EventEnvelope<ActividadRegistroRevertidoPayload>
  ): Promise<void> {
    // Un NO_HIZO nunca pagó monedas (decisión 4): deshacerlo no restituye
    // nada. Descarte explícito.
    if (envelope.payload.tipoRegistro !== 'COMPLETADA') {
      await this.marcarProcesado(envelope.eventId);

      return;
    }

    await this.restituir(envelope, envelope.payload.registroId);
  }

  // ────────────────────────────── internos ──────────────────────────────

  /**
   * El envoltorio común de los ocho: scope de correlación, y en el error un
   * reintento y después la DLQ. Idéntico al de `ZonasConsumer` — se comparte
   * acá porque son ocho suscripciones sobre la misma cola.
   */
  private async manejar(
    envelope: EventEnvelope<unknown>,
    mensaje: MensajeAmqp,
    efecto: () => Promise<void>
  ): Promise<Nack | undefined> {
    try {
      await correlationStorage.run({ correlationId: envelope.correlationId }, efecto);

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

  private async acreditar(
    envelope: EventEnvelope<unknown>,
    datos: DatosAcreditacion,
    esTareaEquipo = false
  ): Promise<void> {
    if (!(await this.enModoTienda(envelope.eventId, datos.grupoId))) {
      return;
    }

    const acreditadas = await this.monedas.acreditar(
      envelope.eventId,
      CONSUMIDOR,
      datos
    );

    // La publicación va DESPUÉS del commit: publicar adentro dejaría avisado un
    // cobro que todavía puede hacer rollback (mismo criterio que ZonasConsumer).
    for (const acreditada of acreditadas) {
      await this.publicar(datos, acreditada, esTareaEquipo);
    }
  }

  private async revertir(
    envelope: EventEnvelope<unknown>,
    registroId: string
  ): Promise<void> {
    if (!(await this.enModoTienda(envelope.eventId, this.grupoDe(envelope)))) {
      return;
    }

    await this.monedas.revertir(envelope.eventId, CONSUMIDOR, registroId);
  }

  private async restituir(
    envelope: EventEnvelope<unknown>,
    registroId: string
  ): Promise<void> {
    if (!(await this.enModoTienda(envelope.eventId, this.grupoDe(envelope)))) {
      return;
    }

    await this.monedas.restituir(envelope.eventId, CONSUMIDOR, registroId);
  }

  /**
   * Decisión 14. `false` deja el evento marcado como procesado y termina: en
   * DIRECTO no se escribe ni un movimiento, y una reentrega no vuelve a
   * consultar la configuración.
   */
  private async enModoTienda(eventId: string, grupoId: string): Promise<boolean> {
    const modo = await this.configuracion.obtenerModo(grupoId);

    if (modo === ModoRecompensas.TIENDA) {
      return true;
    }

    await this.marcarProcesado(eventId);

    return false;
  }

  private async marcarProcesado(eventId: string): Promise<void> {
    try {
      await this.prisma.client.eventoProcesado.create({
        data: { eventId, consumidor: CONSUMIDOR },
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') {
        throw error;
      }

      this.logger.debug(`Evento ${eventId} ya procesado — descartado`);
    }
  }

  private async publicar(
    datos: DatosAcreditacion,
    acreditada: AcreditacionAccion,
    esTareaEquipo: boolean
  ): Promise<void> {
    await this.eventos.publicar<MonedasPorAccionPayload>({
      eventType: 'MonedasPorAccion',
      routingKey: ROUTING_KEYS.MONEDAS_POR_ACCION,
      organizacionId: datos.organizacionId,
      grupoId: datos.grupoId,
      payload: {
        usuarioId: acreditada.usuarioId,
        organizacionId: datos.organizacionId,
        grupoId: datos.grupoId,
        seccionId: datos.seccionId,
        tipoAccion: datos.tipoAccion,
        origenId: datos.origenId,
        nombreAccion: acreditada.nombreAccion,
        monedas: acreditada.monedas,
        saldoResultante: acreditada.saldoResultante,
        esTareaEquipo,
      },
    });

    this.logger.log(
      `${acreditada.monedas} monedas a ${acreditada.usuarioId} por "${acreditada.nombreAccion}" (saldo ${acreditada.saldoResultante})`
    );
  }

  private grupoDe(envelope: EventEnvelope<unknown>): string {
    if (!envelope.grupoId) {
      throw new Error(
        `Envelope ${envelope.eventId} (${envelope.eventType}) sin grupoId — no se puede resolver el modo del grupo`
      );
    }

    return envelope.grupoId;
  }
}
