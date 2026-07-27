import { Injectable, Logger } from '@nestjs/common';

import type {
  ActividadCompletadaPayload,
  ActividadRegistroEliminadoPayload,
  ActividadRegistroRevertidoPayload,
  ConductaRegistradaPayload,
  ConductaRegistroEliminadoPayload,
  EventEnvelope,
  NoHizoRegistradoPayload,
  TareaEquipoCompletadaPayload,
} from '@dorado/shared-events';

import type { EventoPuntos } from '../generated/prisma/client';
import { TipoOrigenPuntos } from '../generated/prisma/enums';
import { PrismaService, type ClientePrisma } from '../prisma/prisma.service';

/** Identificador de este consumidor en la tabla EventoProcesado (ADR-00 §5). */
export const CONSUMIDOR = 'scoring-service';

type TxProyeccion = Pick<ClientePrisma, 'eventoPuntos' | 'eventoProcesado'>;

/** Un eslabón de la cadena de correcciones de un registro (fase-14-12). */
type FilaEventoPuntos = Pick<
  EventoPuntos,
  'id' | 'organizacionId' | 'grupoId' | 'usuarioId' | 'seccionId' | 'sesionId' | 'puntosSnapshot'
>;

/**
 * Proyección de los eventos de registro de activity-service al ledger
 * `EventoPuntos` (spec fase-07, tabla "Eventos consumidos"). Cada efecto es
 * idempotente: chequea `EventoProcesado` antes y lo inserta en la MISMA
 * transacción que la fila del ledger — una reentrega de RabbitMQ no duplica
 * puntos (criterio de aceptación 6).
 *
 * `origenId` guarda el `registroId` del registro de origen (no el id de la
 * Actividad/Conducta): es lo que permite ubicar el asiento exacto a compensar
 * cuando llega `ConductaRegistroEliminado` — ver docs/progreso/fase-07.
 *
 * NUNCA hay UPDATE/DELETE sobre EventoPuntos acá ni en ningún lado (regla 1
 * de CLAUDE.md): la eliminación de una conducta se compensa con una fila
 * nueva de signo opuesto.
 */
@Injectable()
export class ProyeccionService {
  private readonly logger = new Logger(ProyeccionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async procesarActividadCompletada(
    envelope: EventEnvelope<ActividadCompletadaPayload>
  ): Promise<void> {
    await this.proyectarRegistro(envelope, TipoOrigenPuntos.ACTIVIDAD_COMPLETADA, {
      usuarioId: envelope.payload.usuarioId,
      seccionId: envelope.payload.seccionId,
      sesionId: envelope.payload.sesionId,
      origenId: envelope.payload.registroId,
      puntosSnapshot: envelope.payload.valorPuntosSnapshot,
      registradoPorId: envelope.payload.registradoPorId,
      registradoPorTipo: envelope.payload.registradoPorTipo,
    });
  }

  async procesarNoHizoRegistrado(
    envelope: EventEnvelope<NoHizoRegistradoPayload>
  ): Promise<void> {
    // valorPuntosSnapshot ya viene negativo (event-catalog).
    await this.proyectarRegistro(envelope, TipoOrigenPuntos.NO_HIZO, {
      usuarioId: envelope.payload.usuarioId,
      seccionId: envelope.payload.seccionId,
      sesionId: envelope.payload.sesionId,
      origenId: envelope.payload.registroId,
      puntosSnapshot: envelope.payload.valorPuntosSnapshot,
      registradoPorId: envelope.payload.registradoPorId,
      registradoPorTipo: envelope.payload.registradoPorTipo,
    });
  }

  async procesarConductaRegistrada(
    envelope: EventEnvelope<ConductaRegistradaPayload>
  ): Promise<void> {
    // valorPuntosSnapshot ya trae el signo según BUENA/MALA (event-catalog).
    await this.proyectarRegistro(envelope, TipoOrigenPuntos.CONDUCTA, {
      usuarioId: envelope.payload.usuarioId,
      seccionId: envelope.payload.seccionId,
      sesionId: envelope.payload.sesionId,
      origenId: envelope.payload.registroId,
      puntosSnapshot: envelope.payload.valorPuntosSnapshot,
      registradoPorId: envelope.payload.registradoPorId,
      registradoPorTipo: envelope.payload.registradoPorTipo,
    });
  }

  /**
   * Reparto de una tarea de equipo (fase-14-09): crea un EventoPuntos por cada
   * asignación (miembro), etiquetado con `equipoId`. `asignaciones` ya trae el
   * valor resuelto (base + bono del jefe) — scoring no recalcula. Todas las
   * filas + la marca de procesado van en UNA transacción idempotente.
   */
  async procesarTareaEquipoCompletada(
    envelope: EventEnvelope<TareaEquipoCompletadaPayload>
  ): Promise<void> {
    if (await this.yaProcesado(envelope.eventId)) {
      return;
    }

    const payload = envelope.payload;

    await this.enTransaccionIdempotente(envelope.eventId, async (tx) => {
      for (const asignacion of payload.asignaciones) {
        await tx.eventoPuntos.create({
          data: {
            organizacionId: payload.organizacionId,
            grupoId: payload.grupoId,
            usuarioId: asignacion.usuarioId,
            seccionId: payload.seccionId,
            sesionId: payload.sesionId,
            tipoOrigen: TipoOrigenPuntos.ACTIVIDAD_COMPLETADA,
            origenId: payload.registroTareaEquipoId,
            puntosSnapshot: asignacion.puntos,
            registradoPorId: payload.completadaPorId,
            registradoPorTipo: 'SYSTEM',
            equipoId: payload.equipoId,
          },
        });
      }
    });
  }

  /**
   * Compensación (spec): busca el asiento original por `origenId = registroId`
   * y crea uno nuevo de signo opuesto con `corregidoDeId`. Nunca borra ni
   * edita la fila original. Si el original todavía no llegó (no debería:
   * activity publica por el mismo canal en orden), el error manda el mensaje
   * a reintento y eventualmente a la DLQ — nunca descarte silencioso.
   */
  async procesarConductaRegistroEliminado(
    envelope: EventEnvelope<ConductaRegistroEliminadoPayload>
  ): Promise<void> {
    if (await this.yaProcesado(envelope.eventId)) {
      return;
    }

    const original = await this.prisma.client.eventoPuntos.findFirst({
      where: {
        origenId: envelope.payload.registroId,
        tipoOrigen: TipoOrigenPuntos.CONDUCTA,
        organizacionId: envelope.organizacionId,
      },
    });

    if (!original) {
      throw new Error(
        `No existe EventoPuntos de conducta con origenId ${envelope.payload.registroId} para compensar`
      );
    }

    await this.enTransaccionIdempotente(envelope.eventId, async (tx) => {
      await tx.eventoPuntos.create({
        data: {
          organizacionId: original.organizacionId,
          grupoId: original.grupoId,
          usuarioId: original.usuarioId,
          seccionId: original.seccionId,
          sesionId: original.sesionId,
          tipoOrigen: TipoOrigenPuntos.CORRECCION,
          origenId: original.id,
          puntosSnapshot: -original.puntosSnapshot,
          registradoPorId: envelope.payload.eliminadoPorTutorId,
          registradoPorTipo: 'SYSTEM',
          corregidoDeId: original.id,
          motivoCorreccion: 'Registro de conducta eliminado por un tutor',
        },
      });
    });
  }

  /**
   * Compensa una completada de actividad que un tutor quitó (fase-14).
   * Ver `compensarCadena`: se niega el ÚLTIMO asiento de la cadena, no el
   * original. Con una sola quita son la misma fila; la diferencia aparece
   * cuando el tutor ya había deshecho una marca antes (fase-14-12).
   */
  async procesarActividadRegistroEliminado(
    envelope: EventEnvelope<ActividadRegistroEliminadoPayload>
  ): Promise<void> {
    await this.compensarCadena(
      envelope,
      envelope.payload.registroId,
      TipoOrigenPuntos.ACTIVIDAD_COMPLETADA,
      envelope.payload.eliminadoPorTutorId,
      'Completada de actividad quitada por un tutor'
    );
  }

  /**
   * Un tutor deshizo su propia marca roja (fase-14-12): devuelve lo que la
   * marca le había costado al integrante. Restaurar una completada niega la
   * corrección que la había descontado; deshacer un "no hizo" niega el castigo.
   * Las dos cosas son la misma operación sobre la cadena de correcciones.
   */
  async procesarActividadRegistroRevertido(
    envelope: EventEnvelope<ActividadRegistroRevertidoPayload>
  ): Promise<void> {
    const esNoHizo = envelope.payload.tipoRegistro === 'NO_HIZO';

    await this.compensarCadena(
      envelope,
      envelope.payload.registroId,
      esNoHizo ? TipoOrigenPuntos.NO_HIZO : TipoOrigenPuntos.ACTIVIDAD_COMPLETADA,
      envelope.payload.revertidoPorTutorId,
      esNoHizo
        ? 'Marca de «no hizo» deshecha por un tutor'
        : 'Completada de actividad restaurada por un tutor'
    );
  }

  /**
   * Corrige un registro de activity creando una fila de signo opuesto al
   * ÚLTIMO asiento de su cadena de correcciones (fase-14-12, Parte B de la
   * spec del ítem 12).
   *
   * Por qué el último y no el original: tras `completar → quitar` el neto ya
   * es 0, así que deshacer la quita tiene que sumar, no restar de nuevo.
   * Negar siempre el eslabón final hace que la secuencia
   * `completar → quitar → deshacer → quitar` alterne correctamente entre el
   * valor y 0, con cualquier cantidad de idas y vueltas.
   *
   * Nunca borra ni edita la fila original: cada paso es una fila nueva
   * enlazada por `corregidoDeId` (regla 1 y regla 6 de CLAUDE.md).
   */
  private async compensarCadena(
    envelope: EventEnvelope<unknown>,
    registroId: string,
    tipoOrigenDelRegistro: TipoOrigenPuntos,
    registradoPorId: string,
    motivoCorreccion: string
  ): Promise<void> {
    if (await this.yaProcesado(envelope.eventId)) {
      return;
    }

    const original = await this.prisma.client.eventoPuntos.findFirst({
      where: {
        origenId: registroId,
        tipoOrigen: tipoOrigenDelRegistro,
        organizacionId: envelope.organizacionId,
      },
    });

    // Si el original todavía no llegó (no debería: activity publica por el
    // mismo canal en orden), el error manda el mensaje a reintento y
    // eventualmente a la DLQ — nunca descarte silencioso.
    if (!original) {
      throw new Error(
        `No existe EventoPuntos de actividad con origenId ${registroId} para compensar`
      );
    }

    const ultimo = await this.ultimoDeLaCadena(original);

    await this.enTransaccionIdempotente(envelope.eventId, async (tx) => {
      await tx.eventoPuntos.create({
        data: {
          organizacionId: original.organizacionId,
          grupoId: original.grupoId,
          usuarioId: original.usuarioId,
          seccionId: original.seccionId,
          sesionId: original.sesionId,
          tipoOrigen: TipoOrigenPuntos.CORRECCION,
          origenId: ultimo.id,
          puntosSnapshot: -ultimo.puntosSnapshot,
          registradoPorId,
          registradoPorTipo: 'SYSTEM',
          corregidoDeId: ultimo.id,
          motivoCorreccion,
        },
      });
    });
  }

  /**
   * Sigue los `corregidoDeId` desde el asiento original hasta el final. La
   * cadena es de dos o tres eslabones en la práctica (una quita y su posible
   * reversión), y cada eslabón es una fila creada después de la anterior, así
   * que no puede haber ciclos.
   */
  private async ultimoDeLaCadena(original: FilaEventoPuntos): Promise<FilaEventoPuntos> {
    let actual = original;

    for (;;) {
      const siguiente = await this.prisma.client.eventoPuntos.findFirst({
        where: { corregidoDeId: actual.id },
        orderBy: { createdAt: 'desc' },
      });

      if (!siguiente) {
        return actual;
      }

      actual = siguiente;
    }
  }

  private async proyectarRegistro(
    envelope: EventEnvelope<unknown>,
    tipoOrigen: TipoOrigenPuntos,
    datos: {
      usuarioId: string;
      seccionId: string;
      sesionId: string;
      origenId: string;
      puntosSnapshot: number;
      registradoPorId: string;
      registradoPorTipo: string;
    }
  ): Promise<void> {
    if (await this.yaProcesado(envelope.eventId)) {
      return;
    }

    const grupoId = this.grupoDelEnvelope(envelope);

    await this.enTransaccionIdempotente(envelope.eventId, async (tx) => {
      await tx.eventoPuntos.create({
        data: {
          organizacionId: envelope.organizacionId,
          grupoId,
          tipoOrigen,
          ...datos,
        },
      });
    });
  }

  private async yaProcesado(eventId: string): Promise<boolean> {
    const fila = await this.prisma.client.eventoProcesado.findUnique({
      where: { eventId },
    });

    if (fila) {
      this.logger.debug(`Evento ${eventId} ya procesado — descartado`);
    }

    return fila !== null;
  }

  /**
   * Efecto + marca de procesado en UNA transacción. Una P2002 sobre
   * `EventoProcesado.eventId` es otra entrega concurrente que ganó la
   * carrera: el efecto ya está aplicado, se descarta sin error.
   */
  private async enTransaccionIdempotente(
    eventId: string,
    efecto: (tx: TxProyeccion) => Promise<void>
  ): Promise<void> {
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await efecto(tx);
        await tx.eventoProcesado.create({
          data: { eventId, consumidor: CONSUMIDOR },
        });
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        this.logger.debug(`Evento ${eventId} procesado en paralelo — descartado`);
        return;
      }

      throw error;
    }
  }

  private grupoDelEnvelope(envelope: EventEnvelope<unknown>): string {
    if (!envelope.grupoId) {
      throw new Error(
        `Envelope ${envelope.eventId} (${envelope.eventType}) sin grupoId — no se puede proyectar`
      );
    }

    return envelope.grupoId;
  }
}
