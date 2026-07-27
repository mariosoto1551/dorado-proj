import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { EventEnvelope } from '@dorado/shared-events';

import {
  crearBdEnMemoria,
  eventoPuntosDePrueba,
} from '../comun/testing/bd-en-memoria';
import { ProyeccionService } from './proyeccion.service';

function envelopeDePrueba<T>(payload: T, sobrescribir: Partial<EventEnvelope<T>> = {}): EventEnvelope<T> {
  return {
    eventId: randomUUID(),
    eventType: 'ActividadCompletada',
    producedBy: 'activity-service',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    payload,
    ...sobrescribir,
  };
}

const PAYLOAD_COMPLETADA = {
  registroId: 'registro-1',
  usuarioId: 'usuario-1',
  actividadId: 'actividad-1',
  sesionId: 'sesion-1',
  seccionId: 'seccion-1',
  valorPuntosSnapshot: 10,
  registradoPorId: 'usuario-1',
  registradoPorTipo: 'USUARIO' as const,
};

describe('ProyeccionService — registro → ledger', () => {
  it('ActividadCompletada crea el EventoPuntos con snapshot positivo y origenId=registroId', async () => {
    const bd = crearBdEnMemoria();
    const servicio = new ProyeccionService(bd.prisma);

    await servicio.procesarActividadCompletada(envelopeDePrueba(PAYLOAD_COMPLETADA));

    expect(bd.eventosPuntos).toHaveLength(1);
    expect(bd.eventosPuntos[0]).toMatchObject({
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      usuarioId: 'usuario-1',
      seccionId: 'seccion-1',
      sesionId: 'sesion-1',
      tipoOrigen: 'ACTIVIDAD_COMPLETADA',
      origenId: 'registro-1',
      puntosSnapshot: 10,
    });
  });

  it('repetir el MISMO evento (reentrega, mismo eventId) no duplica el asiento — criterio 6', async () => {
    const bd = crearBdEnMemoria();
    const servicio = new ProyeccionService(bd.prisma);
    const envelope = envelopeDePrueba(PAYLOAD_COMPLETADA);

    await servicio.procesarActividadCompletada(envelope);
    await servicio.procesarActividadCompletada(envelope);

    expect(bd.eventosPuntos).toHaveLength(1);
    expect(bd.procesados).toHaveLength(1);
  });

  it('NoHizoRegistrado proyecta el snapshot negativo tal cual viene', async () => {
    const bd = crearBdEnMemoria();
    const servicio = new ProyeccionService(bd.prisma);

    await servicio.procesarNoHizoRegistrado(
      envelopeDePrueba(
        { ...PAYLOAD_COMPLETADA, valorPuntosSnapshot: -15, registradoPorTipo: 'TUTOR' as const },
        { eventType: 'NoHizoRegistrado' }
      )
    );

    expect(bd.eventosPuntos[0]).toMatchObject({ tipoOrigen: 'NO_HIZO', puntosSnapshot: -15 });
  });

  it('ConductaRegistrada proyecta el signo aplicado por activity', async () => {
    const bd = crearBdEnMemoria();
    const servicio = new ProyeccionService(bd.prisma);

    await servicio.procesarConductaRegistrada(
      envelopeDePrueba(
        {
          registroId: 'registro-c1',
          usuarioId: 'usuario-1',
          conductaId: 'conducta-1',
          tipo: 'MALA' as const,
          sesionId: 'sesion-1',
          seccionId: 'seccion-1',
          valorPuntosSnapshot: -5,
          registradoPorId: 'usuario-1',
          registradoPorTipo: 'USUARIO' as const,
        },
        { eventType: 'ConductaRegistrada' }
      )
    );

    expect(bd.eventosPuntos[0]).toMatchObject({
      tipoOrigen: 'CONDUCTA',
      origenId: 'registro-c1',
      puntosSnapshot: -5,
    });
  });

  it('un envelope sin grupoId no se proyecta (error → reintento/DLQ, nunca fila a medias)', async () => {
    const bd = crearBdEnMemoria();
    const servicio = new ProyeccionService(bd.prisma);

    await expect(
      servicio.procesarActividadCompletada(
        envelopeDePrueba(PAYLOAD_COMPLETADA, { grupoId: undefined })
      )
    ).rejects.toThrow(/sin grupoId/);
    expect(bd.eventosPuntos).toHaveLength(0);
    expect(bd.procesados).toHaveLength(0);
  });
});

describe('ProyeccionService — ConductaRegistroEliminado → compensación', () => {
  it('crea la fila de compensación con signo opuesto y corregidoDeId, sin tocar la original', async () => {
    const original = eventoPuntosDePrueba({
      tipoOrigen: 'CONDUCTA',
      origenId: 'registro-c1',
      puntosSnapshot: -5,
    });
    const bd = crearBdEnMemoria({ eventosPuntos: [original] });
    const servicio = new ProyeccionService(bd.prisma);

    await servicio.procesarConductaRegistroEliminado(
      envelopeDePrueba(
        { registroId: 'registro-c1', usuarioId: 'usuario-1', eliminadoPorTutorId: 'tutor-1' },
        { eventType: 'ConductaRegistroEliminado' }
      )
    );

    expect(bd.eventosPuntos).toHaveLength(2);

    const compensacion = bd.eventosPuntos[1];
    expect(compensacion).toMatchObject({
      tipoOrigen: 'CORRECCION',
      origenId: original.id,
      puntosSnapshot: 5,
      corregidoDeId: original.id,
      registradoPorTipo: 'SYSTEM',
      registradoPorId: 'tutor-1',
    });
    // La original queda EXACTAMENTE igual (ledger inmutable, regla 1).
    expect(bd.eventosPuntos[0]).toMatchObject({ puntosSnapshot: -5, corregidoDeId: null });
  });

  it('si el asiento original no existe, lanza (reintento → DLQ; nunca descarte silencioso)', async () => {
    const bd = crearBdEnMemoria();
    const servicio = new ProyeccionService(bd.prisma);

    await expect(
      servicio.procesarConductaRegistroEliminado(
        envelopeDePrueba(
          { registroId: 'registro-fantasma', usuarioId: 'u', eliminadoPorTutorId: 't' },
          { eventType: 'ConductaRegistroEliminado' }
        )
      )
    ).rejects.toThrow(/compensar/);
  });

  it('la reentrega de la eliminación no duplica la compensación', async () => {
    const original = eventoPuntosDePrueba({
      tipoOrigen: 'CONDUCTA',
      origenId: 'registro-c1',
      puntosSnapshot: -5,
    });
    const bd = crearBdEnMemoria({ eventosPuntos: [original] });
    const servicio = new ProyeccionService(bd.prisma);
    const envelope = envelopeDePrueba(
      { registroId: 'registro-c1', usuarioId: 'usuario-1', eliminadoPorTutorId: 'tutor-1' },
      { eventType: 'ConductaRegistroEliminado' }
    );

    await servicio.procesarConductaRegistroEliminado(envelope);
    await servicio.procesarConductaRegistroEliminado(envelope);

    expect(bd.eventosPuntos).toHaveLength(2);
  });
});

describe('ProyeccionService — marcas rojas del tutor (fase-14-12)', () => {
  const suma = (filas: { puntosSnapshot: number }[]): number =>
    filas.reduce((total, fila) => total + fila.puntosSnapshot, 0);

  function eliminar(servicio: ProyeccionService): Promise<void> {
    return servicio.procesarActividadRegistroEliminado(
      envelopeDePrueba(
        { registroId: 'registro-1', usuarioId: 'usuario-1', eliminadoPorTutorId: 'tutor-1' },
        { eventType: 'ActividadRegistroEliminado' }
      )
    );
  }

  function revertir(
    servicio: ProyeccionService,
    tipoRegistro: 'COMPLETADA' | 'NO_HIZO'
  ): Promise<void> {
    return servicio.procesarActividadRegistroRevertido(
      envelopeDePrueba(
        {
          registroId: 'registro-1',
          usuarioId: 'usuario-1',
          revertidoPorTutorId: 'tutor-1',
          tipoRegistro,
        },
        { eventType: 'ActividadRegistroRevertido' }
      )
    );
  }

  it('restaurar una completada quitada devuelve los puntos negando la corrección, no el original', async () => {
    const original = eventoPuntosDePrueba({ origenId: 'registro-1', puntosSnapshot: 5 });
    const bd = crearBdEnMemoria({ eventosPuntos: [original] });
    const servicio = new ProyeccionService(bd.prisma);

    await eliminar(servicio);
    await revertir(servicio, 'COMPLETADA');

    expect(bd.eventosPuntos).toHaveLength(3);
    expect(suma(bd.eventosPuntos)).toBe(5);
    // El último eslabón corrige a la corrección, no al asiento original.
    expect(bd.eventosPuntos[2]).toMatchObject({
      tipoOrigen: 'CORRECCION',
      puntosSnapshot: 5,
      corregidoDeId: bd.eventosPuntos[1].id,
      registradoPorId: 'tutor-1',
      registradoPorTipo: 'SYSTEM',
    });
    // El original nunca se toca (regla 1).
    expect(bd.eventosPuntos[0]).toMatchObject({ puntosSnapshot: 5, corregidoDeId: null });
  });

  it('completar → quitar → deshacer → quitar deja el puntaje en 0 (tabla de la spec)', async () => {
    const original = eventoPuntosDePrueba({ origenId: 'registro-1', puntosSnapshot: 5 });
    const bd = crearBdEnMemoria({ eventosPuntos: [original] });
    const servicio = new ProyeccionService(bd.prisma);

    await eliminar(servicio);
    expect(suma(bd.eventosPuntos)).toBe(0);

    await revertir(servicio, 'COMPLETADA');
    expect(suma(bd.eventosPuntos)).toBe(5);

    await eliminar(servicio);
    expect(suma(bd.eventosPuntos)).toBe(0);
  });

  it('deshacer un "no hizo" compensa el castigo negativo', async () => {
    const castigo = eventoPuntosDePrueba({
      tipoOrigen: 'NO_HIZO',
      origenId: 'registro-1',
      puntosSnapshot: -15,
    });
    const bd = crearBdEnMemoria({ eventosPuntos: [castigo] });
    const servicio = new ProyeccionService(bd.prisma);

    await revertir(servicio, 'NO_HIZO');

    expect(suma(bd.eventosPuntos)).toBe(0);
    expect(bd.eventosPuntos[1]).toMatchObject({
      tipoOrigen: 'CORRECCION',
      puntosSnapshot: 15,
      corregidoDeId: castigo.id,
    });
  });

  it('la reentrega de una reversión no duplica la compensación', async () => {
    const castigo = eventoPuntosDePrueba({
      tipoOrigen: 'NO_HIZO',
      origenId: 'registro-1',
      puntosSnapshot: -15,
    });
    const bd = crearBdEnMemoria({ eventosPuntos: [castigo] });
    const servicio = new ProyeccionService(bd.prisma);
    const envelope = envelopeDePrueba(
      {
        registroId: 'registro-1',
        usuarioId: 'usuario-1',
        revertidoPorTutorId: 'tutor-1',
        tipoRegistro: 'NO_HIZO' as const,
      },
      { eventType: 'ActividadRegistroRevertido' }
    );

    await servicio.procesarActividadRegistroRevertido(envelope);
    await servicio.procesarActividadRegistroRevertido(envelope);

    expect(bd.eventosPuntos).toHaveLength(2);
  });

  it('si el asiento original no existe, lanza (reintento → DLQ)', async () => {
    const bd = crearBdEnMemoria();
    const servicio = new ProyeccionService(bd.prisma);

    await expect(revertir(servicio, 'COMPLETADA')).rejects.toThrow(/compensar/);
  });
});
