import { Injectable } from '@nestjs/common';

import {
  ROUTING_KEYS,
  SeccionEventoPayload,
  SesionEventoPayload,
} from '@dorado/shared-events';

import type { ConfiguracionEfectiva } from '../comun/mapeadores';
import type { EventoAPublicar } from '../eventos/eventos-publisher.service';
import type { Seccion, Sesion } from '../generated/prisma/client';
import { EstadoSeccion, EstadoSesion, ModoSesion } from '../generated/prisma/enums';
import type { ClientePrisma } from '../prisma/prisma.service';

/**
 * Delegados de modelo que usan las transiciones. Los satisface tanto el
 * cliente completo como el cliente transaccional de `$transaction` — los
 * llamadores (endpoints y scheduler) pasan el `tx` para que cada transición
 * compuesta sea atómica.
 */
export type TxSesiones = Pick<ClientePrisma, 'seccion' | 'sesion'>;

export type EventoSesiones = EventoAPublicar<SesionEventoPayload | SeccionEventoPayload>;

/**
 * Máquina de estados de Sección/Sesión (spec fase-06):
 *
 *   Sección: ABIERTA → EVALUACION → CERRADA
 *   Sesión:  ABIERTA → CERRADA
 *
 * Este service SOLO muta filas y acumula los eventos a publicar — no publica
 * (eso se hace después del commit, en el llamador) ni valida acceso (eso es
 * del endpoint/scheduler). Tampoco sabe nada de puntos ni actividades (nota
 * final de la spec: eso es Scoring, Fase 7).
 */
@Injectable()
export class MaquinaSeccionesService {
  /**
   * Crea la Sección siguiente del grupo (numero máx + 1, arranca en 1) junto
   * con su primera Sesión, en la misma operación (spec). Invariante "solo una
   * Sección no-CERRADA por grupo": la valida el llamador dentro de la misma
   * transacción; la carrera residual la corta `@@unique([grupoId, numero])`.
   */
  async abrirSeccion(
    tx: TxSesiones,
    datos: { organizacionId: string; grupoId: string }
  ): Promise<{ seccion: Seccion; sesion: Sesion; eventos: EventoSesiones[] }> {
    const ultima = await tx.seccion.findFirst({
      where: { grupoId: datos.grupoId },
      orderBy: { numero: 'desc' },
    });

    const seccion = await tx.seccion.create({
      data: {
        organizacionId: datos.organizacionId,
        grupoId: datos.grupoId,
        numero: (ultima?.numero ?? 0) + 1,
      },
    });

    const sesion = await tx.sesion.create({
      data: {
        seccionId: seccion.id,
        organizacionId: datos.organizacionId,
        grupoId: datos.grupoId,
        numero: 1,
      },
    });

    return {
      seccion,
      sesion,
      eventos: [
        eventoDeSeccion('SeccionAbierta', ROUTING_KEYS.SECCION_ABIERTA, seccion),
        eventoDeSesion('SesionAbierta', ROUTING_KEYS.SESION_ABIERTA, sesion),
      ],
    };
  }

  /** Cierra la Sesión ABIERTA de la sección, si la hay (si no, no-op). */
  async cerrarSesionAbierta(
    tx: TxSesiones,
    seccionId: string,
    ahora: Date
  ): Promise<{ sesion: Sesion | null; eventos: EventoSesiones[] }> {
    const abierta = await tx.sesion.findFirst({
      where: { seccionId, estado: EstadoSesion.ABIERTA },
    });

    if (!abierta) {
      return { sesion: null, eventos: [] };
    }

    await tx.sesion.updateMany({
      where: { id: abierta.id },
      data: { estado: EstadoSesion.CERRADA, fechaFin: ahora },
    });

    const cerrada: Sesion = { ...abierta, estado: EstadoSesion.CERRADA, fechaFin: ahora };

    return {
      sesion: cerrada,
      eventos: [eventoDeSesion('SesionCerrada', ROUTING_KEYS.SESION_CERRADA, cerrada)],
    };
  }

  /** Abre la Sesión `numero` dentro de la sección. */
  async abrirSesion(
    tx: TxSesiones,
    seccion: Seccion,
    numero: number
  ): Promise<{ sesion: Sesion; eventos: EventoSesiones[] }> {
    const sesion = await tx.sesion.create({
      data: {
        seccionId: seccion.id,
        organizacionId: seccion.organizacionId,
        grupoId: seccion.grupoId,
        numero,
      },
    });

    return {
      sesion,
      eventos: [eventoDeSesion('SesionAbierta', ROUTING_KEYS.SESION_ABIERTA, sesion)],
    };
  }

  /**
   * Autocierre-y-avance del scheduler (spec, casos 1–2 en ese orden): cierra
   * la Sesión abierta (si hay); si con eso ya corrieron las
   * `sesionesPorSeccion` sesiones, la Sección pasa a EVALUACION (no se abre
   * Sesión nueva); si no, abre la siguiente.
   */
  async avanzarSesion(
    tx: TxSesiones,
    seccion: Seccion,
    config: ConfiguracionEfectiva,
    ahora: Date
  ): Promise<{ eventos: EventoSesiones[]; entroEvaluacion: boolean }> {
    const eventos: EventoSesiones[] = [];

    const cierre = await this.cerrarSesionAbierta(tx, seccion.id, ahora);
    eventos.push(...cierre.eventos);

    const maxNumero = await this.maxNumeroSesion(tx, seccion.id);

    if (maxNumero >= config.sesionesPorSeccion) {
      await tx.seccion.updateMany({
        where: { id: seccion.id },
        data: { estado: EstadoSeccion.EVALUACION },
      });

      eventos.push(
        eventoDeSeccion('SeccionEntroEvaluacion', ROUTING_KEYS.SECCION_ENTRO_EVALUACION, seccion)
      );

      return { eventos, entroEvaluacion: true };
    }

    const apertura = await this.abrirSesion(tx, seccion, maxNumero + 1);
    eventos.push(...apertura.eventos);

    return { eventos, entroEvaluacion: false };
  }

  /** ABIERTA → EVALUACION (forzada o por agotarse las sesiones). Cierra la Sesión abierta si la había. */
  async entrarEvaluacion(
    tx: TxSesiones,
    seccion: Seccion,
    ahora: Date
  ): Promise<{ eventos: EventoSesiones[] }> {
    const eventos: EventoSesiones[] = [];

    const cierre = await this.cerrarSesionAbierta(tx, seccion.id, ahora);
    eventos.push(...cierre.eventos);

    await tx.seccion.updateMany({
      where: { id: seccion.id },
      data: { estado: EstadoSeccion.EVALUACION },
    });

    eventos.push(
      eventoDeSeccion('SeccionEntroEvaluacion', ROUTING_KEYS.SECCION_ENTRO_EVALUACION, seccion)
    );

    return { eventos };
  }

  /**
   * Cierra la Sección (desde EVALUACION, o desde ABIERTA como caso de
   * emergencia/seguridad — se cierra también su Sesión abierta). Si
   * `modo=AUTOMATICO`, crea la Sección siguiente + su primera Sesión en la
   * misma operación (spec); en MANUAL no se crea nada.
   */
  async cerrarSeccion(
    tx: TxSesiones,
    seccion: Seccion,
    config: ConfiguracionEfectiva,
    ahora: Date
  ): Promise<{ eventos: EventoSesiones[]; siguiente: Seccion | null }> {
    const eventos: EventoSesiones[] = [];

    const cierre = await this.cerrarSesionAbierta(tx, seccion.id, ahora);
    eventos.push(...cierre.eventos);

    await tx.seccion.updateMany({
      where: { id: seccion.id },
      data: { estado: EstadoSeccion.CERRADA, fechaFin: ahora },
    });

    eventos.push(eventoDeSeccion('SeccionCerrada', ROUTING_KEYS.SECCION_CERRADA, seccion));

    if (config.modo !== ModoSesion.AUTOMATICO) {
      return { eventos, siguiente: null };
    }

    const apertura = await this.abrirSeccion(tx, {
      organizacionId: seccion.organizacionId,
      grupoId: seccion.grupoId,
    });

    eventos.push(...apertura.eventos);

    return { eventos, siguiente: apertura.seccion };
  }

  /** Máximo `numero` de Sesión ya creado en la sección (0 si ninguna). */
  async maxNumeroSesion(tx: TxSesiones, seccionId: string): Promise<number> {
    const ultima = await tx.sesion.findFirst({
      where: { seccionId },
      orderBy: { numero: 'desc' },
    });

    return ultima?.numero ?? 0;
  }
}

export function eventoDeSesion(
  eventType: string,
  routingKey: string,
  sesion: Sesion
): EventoSesiones {
  return {
    eventType,
    routingKey,
    organizacionId: sesion.organizacionId,
    grupoId: sesion.grupoId,
    payload: {
      sesionId: sesion.id,
      seccionId: sesion.seccionId,
      organizacionId: sesion.organizacionId,
      grupoId: sesion.grupoId,
      numero: sesion.numero,
      // fase-14-11: el día de la Sesión (no el del cierre) es el que decide si
      // una actividad programada aplicaba — lo usa el cierre de activity.
      fechaInicio: sesion.fechaInicio.toISOString(),
    },
  };
}

export function eventoDeSeccion(
  eventType: string,
  routingKey: string,
  seccion: Seccion
): EventoSesiones {
  return {
    eventType,
    routingKey,
    organizacionId: seccion.organizacionId,
    grupoId: seccion.grupoId,
    payload: {
      seccionId: seccion.id,
      organizacionId: seccion.organizacionId,
      grupoId: seccion.grupoId,
      numero: seccion.numero,
    },
  };
}
