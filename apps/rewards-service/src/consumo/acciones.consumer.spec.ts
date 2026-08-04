import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type {
  ActividadCompletadaPayload,
  ActividadRegistroEliminadoPayload,
  ActividadRegistroRevertidoPayload,
  ConductaRegistradaPayload,
  EventEnvelope,
  TareaEquipoCompletadaPayload,
  TareaEquipoMarcaPayload,
} from '@dorado/shared-events';

import { MonedasPorAccionService } from '../acciones/monedas-por-accion.service';
import type { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  configuracionDePrueba,
  crearBdEnMemoria,
  movimientoDePrueba,
  rendimientoAccionDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import type { EventosPublisherService } from '../eventos/eventos-publisher.service';
import { AccionesConsumer } from './acciones.consumer';

const MENSAJE = { fields: { redelivered: false } };

/** Un grupo con la tienda prendida — sin esto, nada de este ítem corre. */
function bdConTienda(datos: Parameters<typeof crearBdEnMemoria>[0] = {}): BdEnMemoria {
  return crearBdEnMemoria({
    configuraciones: [configuracionDePrueba({ modo: 'TIENDA' })],
    ...datos,
  });
}

function crearConsumer(bd: BdEnMemoria = bdConTienda()) {
  const identity = {
    obtenerGrupo: vi.fn(),
    obtenerUsuario: vi.fn(),
  } as unknown as IdentityClientService;

  const eventos = {
    publicar: vi.fn(),
    publicarAccionAdministrativa: vi.fn(),
  } as unknown as EventosPublisherService;

  const consumer = new AccionesConsumer(
    bd.prisma,
    new ConfiguracionService(bd.prisma, new AccesoGrupoService(identity), eventos),
    new MonedasPorAccionService(bd.prisma),
    eventos
  );

  return { consumer, bd, eventos };
}

function envelope<T>(eventType: string, payload: T): EventEnvelope<T> {
  return {
    eventId: randomUUID(),
    eventType,
    producedBy: 'activity-service',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    payload,
  };
}

function completada(
  sobrescribir: Partial<ActividadCompletadaPayload> = {}
): EventEnvelope<ActividadCompletadaPayload> {
  return envelope('ActividadCompletada', {
    registroId: 'registro-1',
    usuarioId: 'usuario-1',
    actividadId: 'actividad-1',
    sesionId: 'sesion-1',
    seccionId: 'seccion-1',
    valorPuntosSnapshot: 10,
    registradoPorId: 'usuario-1',
    registradoPorTipo: 'USUARIO' as const,
    ...sobrescribir,
  });
}

function conducta(
  sobrescribir: Partial<ConductaRegistradaPayload> = {}
): EventEnvelope<ConductaRegistradaPayload> {
  return envelope('ConductaRegistrada', {
    registroId: 'registro-c1',
    usuarioId: 'usuario-1',
    conductaId: 'conducta-1',
    tipo: 'BUENA' as const,
    sesionId: 'sesion-1',
    seccionId: 'seccion-1',
    valorPuntosSnapshot: 5,
    registradoPorId: 'tutor-1',
    registradoPorTipo: 'TUTOR' as const,
    ...sobrescribir,
  });
}

const saldo = (bd: BdEnMemoria, usuarioId = 'usuario-1'): number =>
  bd.monedas
    .filter((fila) => fila.usuarioId === usuarioId)
    .reduce((total, fila) => total + fila.monto, 0);

describe('AccionesConsumer — el despacho por eventType', () => {
  /**
   * Este bloque existe por un bug que la unidad NO encontró y la E2E sí: la
   * primera versión declaraba OCHO `@RabbitSubscribe` sobre la misma cola, y
   * RabbitMQ reparte round-robin entre los consumidores de una cola sin mirar
   * con qué routing key se dio de alta cada uno. Un `ActividadCompletada` caía
   * en el handler de tareas de equipo y explotaba en `asignaciones.map`.
   *
   * Los tests de abajo no lo veían porque llamaban a cada método directamente:
   * ahí el ruteo lo hacía el test. Ahora TODOS entran por `onRegistro`, que es
   * la única puerta real, y estos tres verifican la puerta en sí.
   */
  it('cada evento va a su rama: un ActividadCompletada NO se procesa como tarea de equipo', async () => {
    const bd = bdConTienda({
      rendimientosAccion: [rendimientoAccionDePrueba({ monedas: 5 })],
    });
    const { consumer } = crearConsumer(bd);

    // El payload de una completada individual NO tiene `asignaciones`: si el
    // despacho se equivoca de rama, esto lanza.
    const resultado = await consumer.onRegistro(completada(), MENSAJE);

    expect(resultado).toBeUndefined();
    expect(saldo(bd)).toBe(5);
  });

  it('un eventType desconocido falla RUIDOSAMENTE, no en silencio', async () => {
    // Si algún día queda un binding suelto sobre esta cola, tiene que verse.
    const { consumer } = crearConsumer();

    const resultado = await consumer.onRegistro(
      envelope('EventoQueNadieEsperaba', {}),
      MENSAJE
    );

    // Nack con reintento y después DLQ — nunca un descarte callado.
    expect(resultado).toBeDefined();
  });

  it('un envelope sin grupoId no se procesa: no se puede resolver el modo', async () => {
    const bd = bdConTienda();
    const { consumer } = crearConsumer(bd);
    const sinGrupo = { ...completada(), grupoId: undefined };

    const resultado = await consumer.onRegistro(sinGrupo, MENSAJE);

    expect(resultado).toBeDefined();
    expect(bd.procesados).toHaveLength(0);
  });
});

describe('AccionesConsumer — retro-compatibilidad (decisión 14)', () => {
  it('en modo DIRECTO no escribe NI UN movimiento, y marca el evento igual', async () => {
    // Un grupo sin fila de configuración es DIRECTO: el default y el de todos
    // los grupos existentes. Este es el criterio de aceptación que dice que
    // este ítem no le cambia el comportamiento a nadie.
    const { consumer, bd } = crearConsumer(
      crearBdEnMemoria({ rendimientosAccion: [rendimientoAccionDePrueba()] })
    );

    await consumer.onRegistro(completada(), MENSAJE);

    expect(bd.monedas).toHaveLength(0);
    expect(bd.procesados).toHaveLength(1);
  });
});

describe('AccionesConsumer — acreditación (B.1)', () => {
  it('LA INDEPENDENCIA: una actividad de 0 puntos y 5 monedas acredita 5', async () => {
    // El criterio que justifica el ítem entero (decisión 1). Que el evento
    // llegue con `valorPuntosSnapshot: 0` es lo que D.1 hizo posible.
    const bd = bdConTienda({
      rendimientosAccion: [rendimientoAccionDePrueba({ monedas: 5 })],
    });
    const { consumer, eventos } = crearConsumer(bd);

    await consumer.onRegistro(
      completada({ valorPuntosSnapshot: 0 }),
      MENSAJE
    );

    expect(bd.monedas).toHaveLength(1);
    expect(bd.monedas[0]).toMatchObject({
      tipo: 'RENDIMIENTO_ACCION',
      monto: 5,
      // El REGISTRO, no la actividad: es lo que permite revertir esta marca.
      origenId: 'registro-1',
      seccionId: 'seccion-1',
      registradoPorTipo: 'SYSTEM',
    });
    expect(eventos.publicar).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'MonedasPorAccion' })
    );
  });

  it('una actividad SIN rendimiento cargado no ensucia el ledger', async () => {
    const bd = bdConTienda();
    const { consumer, eventos } = crearConsumer(bd);

    await consumer.onRegistro(completada(), MENSAJE);

    expect(bd.monedas).toHaveLength(0);
    expect(bd.procesados).toHaveLength(1);
    expect(eventos.publicar).not.toHaveBeenCalled();
  });

  it('un rendimiento cargado en 0 tampoco escribe movimiento', async () => {
    const bd = bdConTienda({
      rendimientosAccion: [rendimientoAccionDePrueba({ monedas: 0 })],
    });
    const { consumer } = crearConsumer(bd);

    await consumer.onRegistro(completada(), MENSAJE);

    expect(bd.monedas).toHaveLength(0);
  });

  it('CADA REPETICIÓN PAGA: tres completadas de 3 monedas dejan tres movimientos y +9', async () => {
    const bd = bdConTienda({
      rendimientosAccion: [rendimientoAccionDePrueba({ monedas: 3 })],
    });
    const { consumer } = crearConsumer(bd);

    for (const registroId of ['registro-1', 'registro-2', 'registro-3']) {
      await consumer.onRegistro(completada({ registroId }), MENSAJE);
    }

    expect(bd.monedas).toHaveLength(3);
    expect(saldo(bd)).toBe(9);
  });

  it('una conducta BUENA acredita', async () => {
    const bd = bdConTienda({
      rendimientosAccion: [
        rendimientoAccionDePrueba({
          tipoAccion: 'CONDUCTA',
          origenId: 'conducta-1',
          nombreSnapshot: 'Ayudó sin que se lo pidan',
          monedas: 4,
        }),
      ],
    });
    const { consumer } = crearConsumer(bd);

    await consumer.onRegistro(conducta(), MENSAJE);

    expect(saldo(bd)).toBe(4);
  });

  it('una conducta MALA no acredita NI RESTA, aunque tenga rendimiento cargado', async () => {
    // Decisión 4: lo que se hace nunca debita. La fila solo puede existir si se
    // cargó por API saltándose el `PUT` — igual no tiene efecto.
    const bd = bdConTienda({
      rendimientosAccion: [
        rendimientoAccionDePrueba({
          tipoAccion: 'CONDUCTA',
          origenId: 'conducta-mala',
          monedas: 4,
        }),
      ],
    });
    const { consumer } = crearConsumer(bd);

    await consumer.onRegistro(
      conducta({ tipo: 'MALA', conductaId: 'conducta-mala', valorPuntosSnapshot: -5 }),
      MENSAJE
    );

    expect(bd.monedas).toHaveLength(0);
    expect(bd.procesados).toHaveLength(1);
  });

  it('reentregar el mismo evento no acredita dos veces (idempotencia)', async () => {
    const bd = bdConTienda({
      rendimientosAccion: [rendimientoAccionDePrueba({ monedas: 5 })],
    });
    const { consumer } = crearConsumer(bd);
    const evento = completada();

    await consumer.onRegistro(evento, MENSAJE);
    await consumer.onRegistro(evento, MENSAJE);

    expect(bd.monedas).toHaveLength(1);
    expect(saldo(bd)).toBe(5);
  });
});

describe('AccionesConsumer — tarea de equipo (decisión 8)', () => {
  function tareaCompletada(): EventEnvelope<TareaEquipoCompletadaPayload> {
    return envelope('TareaEquipoCompletada', {
      registroTareaEquipoId: 'reg-equipo-1',
      actividadId: 'actividad-1',
      equipoId: 'equipo-1',
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      sesionId: 'sesion-1',
      seccionId: 'seccion-1',
      completadaPorId: 'usuario-jefe',
      completadaPorTipo: 'USUARIO' as const,
      asignaciones: [
        { usuarioId: 'usuario-jefe', puntos: 13, esJefe: true },
        { usuarioId: 'usuario-2', puntos: 10, esJefe: false },
        { usuarioId: 'usuario-3', puntos: 10, esJefe: false },
      ],
    });
  }

  function bdConTarea(): BdEnMemoria {
    return bdConTienda({
      rendimientosAccion: [
        rendimientoAccionDePrueba({ monedas: 5, monedasBonoJefe: 2 }),
      ],
    });
  }

  it('paga las monedas COMPLETAS a cada miembro y el bono al jefe: 5, 5 y 7', async () => {
    const bd = bdConTarea();
    const { consumer } = crearConsumer(bd);

    await consumer.onRegistro(tareaCompletada(), MENSAJE);

    expect(bd.monedas).toHaveLength(3);
    expect(saldo(bd, 'usuario-jefe')).toBe(7);
    expect(saldo(bd, 'usuario-2')).toBe(5);
    expect(saldo(bd, 'usuario-3')).toBe(5);
  });

  it('los tres movimientos comparten el mismo origenId (el registro del reparto)', async () => {
    const bd = bdConTarea();
    const { consumer } = crearConsumer(bd);

    await consumer.onRegistro(tareaCompletada(), MENSAJE);

    expect(bd.monedas.map((fila) => fila.origenId)).toEqual([
      'reg-equipo-1',
      'reg-equipo-1',
      'reg-equipo-1',
    ]);
  });

  it('ANULAR revierte a TODOS los que cobraron, no solo al jefe', async () => {
    // El error exacto que fase-14-13 documentó para scoring: compensar el
    // primero deja el resto de las billeteras mal EN SILENCIO.
    const bd = bdConTarea();
    const { consumer } = crearConsumer(bd);

    await consumer.onRegistro(tareaCompletada(), MENSAJE);
    await consumer.onRegistro(
      envelope<TareaEquipoMarcaPayload>('TareaEquipoAnulada', {
        registroTareaEquipoId: 'reg-equipo-1',
        equipoId: 'equipo-1',
        tutorId: 'tutor-1',
      }),
      MENSAJE
    );

    expect(saldo(bd, 'usuario-jefe')).toBe(0);
    expect(saldo(bd, 'usuario-2')).toBe(0);
    expect(saldo(bd, 'usuario-3')).toBe(0);
    // Tres acreditaciones + tres reversiones: nadie se quedó sin su fila.
    expect(bd.monedas.filter((fila) => fila.tipo === 'REVERSION_ACCION')).toHaveLength(3);
  });

  it('deshacer la anulación devuelve a los tres lo suyo', async () => {
    const bd = bdConTarea();
    const { consumer } = crearConsumer(bd);

    await consumer.onRegistro(tareaCompletada(), MENSAJE);
    await consumer.onRegistro(
      envelope<TareaEquipoMarcaPayload>('TareaEquipoAnulada', {
        registroTareaEquipoId: 'reg-equipo-1',
        equipoId: 'equipo-1',
        tutorId: 'tutor-1',
      }),
      MENSAJE
    );
    await consumer.onRegistro(
      envelope<TareaEquipoMarcaPayload>('TareaEquipoRevertida', {
        registroTareaEquipoId: 'reg-equipo-1',
        equipoId: 'equipo-1',
        tutorId: 'tutor-1',
      }),
      MENSAJE
    );

    expect(saldo(bd, 'usuario-jefe')).toBe(7);
    expect(saldo(bd, 'usuario-2')).toBe(5);
  });
});

describe('AccionesConsumer — reversión con piso en 0 (decisiones 6 y 7)', () => {
  function eliminado(
    sobrescribir: Partial<ActividadRegistroEliminadoPayload> = {}
  ): EventEnvelope<ActividadRegistroEliminadoPayload> {
    return envelope('ActividadRegistroEliminado', {
      registroId: 'registro-1',
      usuarioId: 'usuario-1',
      eliminadoPorTutorId: 'tutor-1',
      ...sobrescribir,
    });
  }

  function revertido(
    sobrescribir: Partial<ActividadRegistroRevertidoPayload> = {}
  ): EventEnvelope<ActividadRegistroRevertidoPayload> {
    return envelope('ActividadRegistroRevertido', {
      registroId: 'registro-1',
      usuarioId: 'usuario-1',
      revertidoPorTutorId: 'tutor-1',
      tipoRegistro: 'COMPLETADA' as const,
      ...sobrescribir,
    });
  }

  it('con saldo suficiente descuenta todo lo acreditado', async () => {
    const bd = bdConTienda({
      rendimientosAccion: [rendimientoAccionDePrueba({ monedas: 5 })],
    });
    const { consumer } = crearConsumer(bd);

    await consumer.onRegistro(completada(), MENSAJE);
    await consumer.onRegistro(eliminado(), MENSAJE);

    expect(saldo(bd)).toBe(0);
    expect(bd.monedas[1]).toMatchObject({ tipo: 'REVERSION_ACCION', monto: -5 });
  });

  it('EL PISO EN 0: con 5 acreditadas y saldo 2, descuenta 2 y explica el faltante', async () => {
    const bd = bdConTienda({
      rendimientosAccion: [rendimientoAccionDePrueba({ monedas: 5 })],
    });
    const { consumer } = crearConsumer(bd);

    await consumer.onRegistro(completada(), MENSAJE);
    // El participante gastó 3 de las 5: le quedan 2.
    bd.monedas.push(movimientoDePrueba({ tipo: 'COMPRA', monto: -3 }));

    await consumer.onRegistro(eliminado(), MENSAJE);

    expect(saldo(bd)).toBe(0);

    const reversion = bd.monedas.find((fila) => fila.tipo === 'REVERSION_ACCION');
    expect(reversion?.monto).toBe(-2);
    // La fila tiene que EXPLICAR lo que no pudo recuperar: es justo lo que el
    // Tutor va a preguntar al ver que el saldo no bajó lo que debía.
    expect(reversion?.motivo).toContain('3 de 5');
  });

  it('con saldo 0 la fila se escribe IGUAL, con monto 0', async () => {
    const bd = bdConTienda({
      rendimientosAccion: [rendimientoAccionDePrueba({ monedas: 5 })],
    });
    const { consumer } = crearConsumer(bd);

    await consumer.onRegistro(completada(), MENSAJE);
    bd.monedas.push(movimientoDePrueba({ tipo: 'COMPRA', monto: -5 }));

    await consumer.onRegistro(eliminado(), MENSAJE);

    const reversion = bd.monedas.find((fila) => fila.tipo === 'REVERSION_ACCION');
    expect(reversion).toBeDefined();
    expect(reversion?.monto).toBe(0);
    expect(reversion?.motivo).toContain('5 de 5');
  });

  it('RESTITUCIÓN EXACTA: deshacer una quita de 2 sobre 5 devuelve 2, no 5', async () => {
    // Decisión 7: devolver 5 regalaría 3 monedas por el camino de una
    // corrección — el agujero que abre el piso en 0 si no se cierra acá.
    const bd = bdConTienda({
      rendimientosAccion: [rendimientoAccionDePrueba({ monedas: 5 })],
    });
    const { consumer } = crearConsumer(bd);

    await consumer.onRegistro(completada(), MENSAJE);
    bd.monedas.push(movimientoDePrueba({ tipo: 'COMPRA', monto: -3 }));
    await consumer.onRegistro(eliminado(), MENSAJE);
    await consumer.onRegistro(revertido(), MENSAJE);

    expect(saldo(bd)).toBe(2);

    const restitucion = bd.monedas.at(-1);
    expect(restitucion).toMatchObject({ tipo: 'REVERSION_ACCION', monto: 2 });
  });

  it('completar → quitar → deshacer → quitar alterna 5 y 0 sin desfasarse', async () => {
    const bd = bdConTienda({
      rendimientosAccion: [rendimientoAccionDePrueba({ monedas: 5 })],
    });
    const { consumer } = crearConsumer(bd);

    await consumer.onRegistro(completada(), MENSAJE);
    expect(saldo(bd)).toBe(5);

    await consumer.onRegistro(eliminado(), MENSAJE);
    expect(saldo(bd)).toBe(0);

    await consumer.onRegistro(revertido(), MENSAJE);
    expect(saldo(bd)).toBe(5);

    await consumer.onRegistro(eliminado(), MENSAJE);
    expect(saldo(bd)).toBe(0);
  });

  it('deshacer un NO_HIZO no restituye nada: nunca pagó monedas', async () => {
    const bd = bdConTienda({
      rendimientosAccion: [rendimientoAccionDePrueba({ monedas: 5 })],
    });
    const { consumer } = crearConsumer(bd);

    await consumer.onRegistro(
      revertido({ tipoRegistro: 'NO_HIZO' }),
      MENSAJE
    );

    expect(bd.monedas).toHaveLength(0);
    expect(bd.procesados).toHaveLength(1);
  });

  it('quitar una marca que nunca pagó monedas no escribe nada y no va a la DLQ', async () => {
    const bd = bdConTienda();
    const { consumer } = crearConsumer(bd);

    const resultado = await consumer.onRegistro(eliminado(), MENSAJE);

    expect(resultado).toBeUndefined();
    expect(bd.monedas).toHaveLength(0);
    expect(bd.procesados).toHaveLength(1);
  });

  it('reentregar la reversión no descuenta dos veces', async () => {
    const bd = bdConTienda({
      rendimientosAccion: [rendimientoAccionDePrueba({ monedas: 5 })],
    });
    const { consumer } = crearConsumer(bd);
    const quita = eliminado();

    await consumer.onRegistro(completada(), MENSAJE);
    await consumer.onRegistro(quita, MENSAJE);
    await consumer.onRegistro(quita, MENSAJE);

    expect(saldo(bd)).toBe(0);
    expect(bd.monedas.filter((fila) => fila.tipo === 'REVERSION_ACCION')).toHaveLength(1);
  });
});
