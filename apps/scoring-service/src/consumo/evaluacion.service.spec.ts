import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { EventEnvelope, SeccionEventoPayload, SesionEventoPayload } from '@dorado/shared-events';
import { EvaluarUmbralesEn, ModoSesion } from '@dorado/shared-types';
import type { ConfiguracionSesionDto, UsuarioDto } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import type { SessionClientService } from '../clientes/session-client.service';
import {
  crearBdEnMemoria,
  eventoPuntosDePrueba,
  umbralDePrueba,
  type BdEnMemoria,
} from '../comun/testing/bd-en-memoria';
import type {
  EventosPublisherService,
  EventoAPublicar,
} from '../eventos/eventos-publisher.service';
import { EvaluacionService } from './evaluacion.service';

function usuarioDePrueba(id: string): UsuarioDto {
  return {
    id,
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    username: id,
    nombre: id,
    avatarId: 'a1',
    estado: 'ACTIVO',
    createdAt: new Date().toISOString(),
  };
}

/** Umbrales: Rojo [-1000,49], Verde [50,null] — suficiente para distinguir. */
const UMBRALES = [
  umbralDePrueba({ id: 'umbral-rojo', nombreZona: 'Rojo', orden: 1, puntosMin: -1000, puntosMax: 49 }),
  umbralDePrueba({ id: 'umbral-verde', nombreZona: 'Verde', orden: 2, puntosMin: 50, puntosMax: null }),
];

function crearServicio(opciones: {
  bd?: BdEnMemoria;
  usuarios?: UsuarioDto[];
  evaluarUmbralesEn?: ConfiguracionSesionDto['evaluarUmbralesEn'];
}) {
  const bd = opciones.bd ?? crearBdEnMemoria({ umbrales: UMBRALES });
  const publicados: EventoAPublicar<unknown>[] = [];

  const identity = {
    usuariosDelGrupo: vi.fn().mockResolvedValue(opciones.usuarios ?? [usuarioDePrueba('usuario-1')]),
  } as unknown as IdentityClientService;
  const session = {
    configuracionDelGrupo: vi.fn().mockResolvedValue({
      grupoId: 'grupo-1',
      modo: ModoSesion.MANUAL,
      cronSesion: null,
      sesionesPorSeccion: 1,
      cronCierreSeccion: null,
      evaluarUmbralesEn: opciones.evaluarUmbralesEn ?? EvaluarUmbralesEn.SOLO_AL_CIERRE_SECCION,
    } satisfies ConfiguracionSesionDto),
  } as unknown as SessionClientService;
  const eventos = {
    publicar: vi.fn(async (evento: EventoAPublicar<unknown>) => {
      publicados.push(evento);
    }),
    publicarTodos: vi.fn(async (lista: EventoAPublicar<unknown>[]) => {
      publicados.push(...lista);
    }),
  } as unknown as EventosPublisherService;

  return { servicio: new EvaluacionService(bd.prisma, identity, session, eventos), bd, publicados };
}

function envelopeSesionCerrada(): EventEnvelope<SesionEventoPayload> {
  return {
    eventId: randomUUID(),
    eventType: 'SesionCerrada',
    producedBy: 'session-service',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    payload: { sesionId: 'sesion-1', seccionId: 'seccion-1', organizacionId: 'org-1', grupoId: 'grupo-1', numero: 1 },
  };
}

function envelopeEntroEvaluacion(): EventEnvelope<SeccionEventoPayload> {
  return {
    eventId: randomUUID(),
    eventType: 'SeccionEntroEvaluacion',
    producedBy: 'session-service',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    payload: { seccionId: 'seccion-1', organizacionId: 'org-1', grupoId: 'grupo-1', numero: 1 },
  };
}

describe('EvaluacionService — SesionCerrada (evaluación intermedia)', () => {
  it('con evaluarUmbralesEn=SOLO_AL_CIERRE_SECCION no publica nada ni escribe resultados', async () => {
    const { servicio, bd, publicados } = crearServicio({ evaluarUmbralesEn: EvaluarUmbralesEn.SOLO_AL_CIERRE_SECCION });

    await servicio.procesarSesionCerrada(envelopeSesionCerrada());

    expect(publicados).toHaveLength(0);
    expect(bd.resultados).toHaveLength(0);
    expect(bd.procesados).toHaveLength(1);
  });

  it('con CADA_SESION publica ZonaAlcanzada esEvaluacionFinal=false y NO escribe ResultadoSeccion', async () => {
    const bd = crearBdEnMemoria({
      umbrales: UMBRALES,
      eventosPuntos: [eventoPuntosDePrueba({ usuarioId: 'usuario-1', puntosSnapshot: 60 })],
    });
    const { servicio, publicados } = crearServicio({ bd, evaluarUmbralesEn: EvaluarUmbralesEn.CADA_SESION });

    await servicio.procesarSesionCerrada(envelopeSesionCerrada());

    expect(bd.resultados).toHaveLength(0);
    expect(publicados).toHaveLength(1);
    expect(publicados[0].payload).toMatchObject({
      usuarioId: 'usuario-1',
      puntajeTotal: 60,
      umbralZonaId: 'umbral-verde',
      nombreZona: 'Verde',
      esEvaluacionFinal: false,
    });
  });

  it('reentrega del mismo eventId no vuelve a publicar', async () => {
    const { servicio, publicados } = crearServicio({ evaluarUmbralesEn: EvaluarUmbralesEn.CADA_SESION });
    const envelope = envelopeSesionCerrada();

    await servicio.procesarSesionCerrada(envelope);
    const publicadosTrasPrimera = publicados.length;
    await servicio.procesarSesionCerrada(envelope);

    expect(publicados.length).toBe(publicadosTrasPrimera);
  });
});

describe('EvaluacionService — SeccionEntroEvaluacion (evaluación FINAL)', () => {
  it('escribe un ResultadoSeccion por usuario ACTIVO y publica la final solo para no descalificados', async () => {
    const bd = crearBdEnMemoria({
      umbrales: UMBRALES,
      eventosPuntos: [
        eventoPuntosDePrueba({ usuarioId: 'usuario-1', puntosSnapshot: 60 }),
        eventoPuntosDePrueba({ usuarioId: 'usuario-1', puntosSnapshot: 15 }),
        eventoPuntosDePrueba({ usuarioId: 'usuario-2', puntosSnapshot: 10 }),
      ],
    });
    // usuario-3 descalificado; usuario-2 en Rojo; usuario-1 en Verde (75).
    bd.descalificaciones.push({
      id: randomUUID(),
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      usuarioId: 'usuario-3',
      seccionId: 'seccion-1',
      motivo: 'trampa',
      registradaPorTutorId: 'tutor-1',
      createdAt: new Date(),
    });
    const { servicio, publicados } = crearServicio({
      bd,
      usuarios: [usuarioDePrueba('usuario-1'), usuarioDePrueba('usuario-2'), usuarioDePrueba('usuario-3')],
    });

    await servicio.procesarSeccionEntroEvaluacion(envelopeEntroEvaluacion());

    expect(bd.resultados).toHaveLength(3);
    expect(bd.resultados.find((r) => r.usuarioId === 'usuario-1')).toMatchObject({
      puntajeTotal: 75,
      umbralZonaId: 'umbral-verde',
      nombreZona: 'Verde',
      descalificado: false,
    });
    expect(bd.resultados.find((r) => r.usuarioId === 'usuario-2')).toMatchObject({
      puntajeTotal: 10,
      umbralZonaId: 'umbral-rojo',
      descalificado: false,
    });
    expect(bd.resultados.find((r) => r.usuarioId === 'usuario-3')).toMatchObject({
      puntajeTotal: 0,
      umbralZonaId: null,
      nombreZona: null,
      descalificado: true,
    });

    // ZonaAlcanzada final: usuario-1 y usuario-2, nunca el descalificado.
    expect(publicados).toHaveLength(2);
    expect(publicados.map((evento) => (evento.payload as { usuarioId: string }).usuarioId)).toEqual(
      ['usuario-1', 'usuario-2']
    );
    expect(
      publicados.every((evento) => (evento.payload as { esEvaluacionFinal: boolean }).esEvaluacionFinal)
    ).toBe(true);
  });

  it('un usuario sin asientos queda con puntaje 0 y la zona que corresponda a 0', async () => {
    const { servicio, bd } = crearServicio({ usuarios: [usuarioDePrueba('usuario-nuevo')] });

    await servicio.procesarSeccionEntroEvaluacion(envelopeEntroEvaluacion());

    expect(bd.resultados[0]).toMatchObject({
      usuarioId: 'usuario-nuevo',
      puntajeTotal: 0,
      umbralZonaId: 'umbral-rojo',
    });
  });

  it('si la Sección ya tiene resultados escritos (otra entrega), no reescribe ni republica', async () => {
    const bd = crearBdEnMemoria({ umbrales: UMBRALES });
    const { servicio, publicados } = crearServicio({ bd });

    // Dos envelopes DISTINTOS (eventId diferente) para la misma sección: el
    // guard de EventoProcesado no alcanza, tiene que frenar el de resultados.
    await servicio.procesarSeccionEntroEvaluacion(envelopeEntroEvaluacion());
    const resultadosTrasPrimera = bd.resultados.length;
    const publicadosTrasPrimera = publicados.length;

    await servicio.procesarSeccionEntroEvaluacion(envelopeEntroEvaluacion());

    expect(bd.resultados.length).toBe(resultadosTrasPrimera);
    expect(publicados.length).toBe(publicadosTrasPrimera);
  });

  it('las correcciones del ledger participan de la suma (fila nueva, nunca UPDATE)', async () => {
    const original = eventoPuntosDePrueba({ usuarioId: 'usuario-1', puntosSnapshot: -5, tipoOrigen: 'CONDUCTA' });
    const bd = crearBdEnMemoria({
      umbrales: UMBRALES,
      eventosPuntos: [
        original,
        eventoPuntosDePrueba({
          usuarioId: 'usuario-1',
          puntosSnapshot: 5,
          tipoOrigen: 'CORRECCION',
          corregidoDeId: original.id,
        }),
        eventoPuntosDePrueba({ usuarioId: 'usuario-1', puntosSnapshot: 60 }),
      ],
    });
    const { servicio } = crearServicio({ bd });

    await servicio.procesarSeccionEntroEvaluacion(envelopeEntroEvaluacion());

    expect(bd.resultados[0]).toMatchObject({ puntajeTotal: 60, nombreZona: 'Verde' });
  });
});
