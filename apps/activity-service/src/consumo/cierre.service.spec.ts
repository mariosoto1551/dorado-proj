import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { EventEnvelope, SesionEventoPayload } from '@dorado/shared-events';
import type { UsuarioDto } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import type {
  EventoAPublicar,
  EventosPublisherService,
} from '../eventos/eventos-publisher.service';
import type { Actividad, RegistroActividad } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { actividadDePrueba } from '../comun/testing/bd-registro-en-memoria';
import { CierreService } from './cierre.service';

type Fila = Record<string, unknown>;

/** Igualdad simple + soporte del operador `{ in: [...] }` que usa el consumidor. */
function matchea(fila: Fila, where: Fila): boolean {
  return Object.entries(where).every(([campo, condicion]) => {
    if (condicion && typeof condicion === 'object' && 'in' in (condicion as object)) {
      return (condicion as { in: unknown[] }).in.includes(fila[campo]);
    }

    return fila[campo] === condicion;
  });
}

interface OpcionesBd {
  actividades: Actividad[];
  registros?: Partial<RegistroActividad>[];
  procesados?: string[];
}

function crearBd(opciones: OpcionesBd) {
  const registros: Fila[] = [...(opciones.registros ?? [])];
  const eventoProcesado: Fila[] = (opciones.procesados ?? []).map((eventId) => ({
    eventId,
    consumidor: 'activity-service',
  }));

  const client = {
    actividad: {
      findMany: async ({ where }: { where: Fila }) =>
        opciones.actividades.filter((actividad) => matchea(actividad as Fila, where)),
    },
    registroActividad: {
      findMany: async ({ where }: { where: Fila }) =>
        registros.filter((fila) => matchea(fila, where)),
      create: async ({ data }: { data: Fila }) => {
        const fila = { id: randomUUID(), createdAt: new Date(), ...data };

        registros.push(fila);

        return fila;
      },
    },
    eventoProcesado: {
      findUnique: async ({ where }: { where: { eventId: string } }) =>
        eventoProcesado.find((fila) => fila['eventId'] === where.eventId) ?? null,
      create: async ({ data }: { data: Fila }) => {
        if (eventoProcesado.some((fila) => fila['eventId'] === data['eventId'])) {
          throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        }

        eventoProcesado.push(data);

        return data;
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(client),
  };

  return { registros, eventoProcesado, prisma: { client } as unknown as PrismaService };
}

function usuario(id: string): UsuarioDto {
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

/**
 * fase-14-11: `fechaInicio` es el día al que pertenecía la Sesión cerrada. Por
 * default, lunes 13/07/2026 00:00 en La Paz (04:00Z) — la misma semana de
 * referencia que `deadline.spec.ts` y `programacion.spec.ts`.
 */
function envelopeCierre(
  eventId: string = randomUUID(),
  fechaInicio: string | undefined = '2026-07-13T04:00:00.000Z'
): EventEnvelope<SesionEventoPayload> {
  return {
    eventId,
    eventType: 'SesionCerrada',
    producedBy: 'session-service',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    occurredAt: new Date().toISOString(),
    correlationId: 'corr-1',
    payload: {
      sesionId: 'sesion-1',
      seccionId: 'seccion-1',
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      numero: 1,
      ...(fechaInicio !== undefined && { fechaInicio }),
    },
  };
}

function crearServicio(bd: ReturnType<typeof crearBd>, usuarios: UsuarioDto[]) {
  const publicados: EventoAPublicar<unknown>[] = [];
  const identity = {
    usuariosDelGrupo: vi.fn().mockResolvedValue(usuarios),
    // fase-14-11: la timezone del Grupo decide qué día fue la Sesión.
    obtenerGrupo: vi.fn().mockResolvedValue({
      id: 'grupo-1',
      organizacionId: 'org-1',
      nombre: 'Grupo Uno',
      timezone: 'America/La_Paz',
      createdAt: new Date().toISOString(),
    }),
  } as unknown as IdentityClientService;
  const eventos = {
    publicar: vi.fn(async (evento: EventoAPublicar<unknown>) => {
      publicados.push(evento);
    }),
  } as unknown as EventosPublisherService;

  return {
    servicio: new CierreService(bd.prisma, identity, eventos),
    publicados,
    identity,
  };
}

const CONFIRMABLE = () =>
  actividadDePrueba({
    id: 'obl-1',
    tipoPuntaje: 'OBLIGATORIA',
    comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
    valorPuntos: 20,
  });

describe('CierreService — castigo automático al cerrar la sesión (fase-14-08)', () => {
  it('genera un NO_HIZO (-valorPuntos, SYSTEM) por cada usuario que no confirmó', async () => {
    const bd = crearBd({ actividades: [CONFIRMABLE()] });
    const { servicio, publicados } = crearServicio(bd, [usuario('u1'), usuario('u2')]);

    await servicio.procesarSesionCerrada(envelopeCierre());

    expect(bd.registros).toHaveLength(2);
    expect(bd.registros[0]).toMatchObject({
      tipo: 'NO_HIZO',
      valorPuntosSnapshot: -20,
      registradoPorId: 'SYSTEM',
      registradoPorTipo: 'SYSTEM',
      sesionId: 'sesion-1',
      seccionId: 'seccion-1',
    });
    expect(publicados).toHaveLength(2);
    expect(publicados[0]).toMatchObject({ eventType: 'NoHizoRegistrado' });
    expect(publicados[0].payload).toMatchObject({
      valorPuntosSnapshot: -20,
      registradoPorTipo: 'SYSTEM',
    });
  });

  it('saltea a quien confirmó (COMPLETADA) y a quien ya tiene un NO_HIZO manual', async () => {
    const bd = crearBd({
      actividades: [CONFIRMABLE()],
      registros: [
        {
          organizacionId: 'org-1',
          grupoId: 'grupo-1',
          usuarioId: 'u1',
          actividadId: 'obl-1',
          sesionId: 'sesion-1',
          tipo: 'COMPLETADA',
        },
        {
          organizacionId: 'org-1',
          grupoId: 'grupo-1',
          usuarioId: 'u2',
          actividadId: 'obl-1',
          sesionId: 'sesion-1',
          tipo: 'NO_HIZO',
        },
      ],
    });
    const { servicio, publicados } = crearServicio(bd, [
      usuario('u1'),
      usuario('u2'),
      usuario('u3'),
    ]);

    await servicio.procesarSesionCerrada(envelopeCierre());

    // Solo u3 (sin registro) recibe el no-hizo automático.
    const nuevos = bd.registros.filter((r) => r['registradoPorId'] === 'SYSTEM');
    expect(nuevos).toHaveLength(1);
    expect(nuevos[0]).toMatchObject({ usuarioId: 'u3', valorPuntosSnapshot: -20 });
    expect(publicados).toHaveLength(1);
  });

  it('reentrega del mismo evento (eventId ya procesado) → no-op', async () => {
    const eventId = 'evt-repetido';
    const bd = crearBd({ actividades: [CONFIRMABLE()], procesados: [eventId] });
    const { servicio, publicados, identity } = crearServicio(bd, [usuario('u1')]);

    await servicio.procesarSesionCerrada(envelopeCierre(eventId));

    expect(bd.registros).toHaveLength(0);
    expect(publicados).toHaveLength(0);
    expect(identity.usuariosDelGrupo).not.toHaveBeenCalled();
  });

  it('marca el evento como procesado tras generar los no-hizo (segunda entrega no duplica)', async () => {
    const envelope = envelopeCierre();
    const bd = crearBd({ actividades: [CONFIRMABLE()] });
    const { servicio, publicados } = crearServicio(bd, [usuario('u1')]);

    await servicio.procesarSesionCerrada(envelope);
    await servicio.procesarSesionCerrada(envelope);

    expect(bd.registros).toHaveLength(1);
    expect(publicados).toHaveLength(1);
  });

  it('sin obligatorias confirmables no consulta identity pero igual marca procesado', async () => {
    const bd = crearBd({ actividades: [] });
    const { servicio, publicados, identity } = crearServicio(bd, [usuario('u1')]);

    await servicio.procesarSesionCerrada(envelopeCierre());

    expect(identity.usuariosDelGrupo).not.toHaveBeenCalled();
    expect(publicados).toHaveLength(0);
    expect(bd.eventoProcesado).toHaveLength(1);
  });
});

describe('CierreService — obligatorias programadas (fase-14-11)', () => {
  // Programada solo para los MARTES (2). La sesión por default es de un LUNES.
  const CONFIRMABLE_MARTES = () =>
    actividadDePrueba({
      id: 'obl-martes',
      tipoPuntaje: 'OBLIGATORIA',
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      valorPuntos: 20,
      diasSemana: [2],
    });

  it('NO castiga al cerrar la sesión de un día que no le tocaba (el caso que motiva el ítem)', async () => {
    const bd = crearBd({ actividades: [CONFIRMABLE_MARTES()] });
    const { servicio, publicados } = crearServicio(bd, [usuario('u1'), usuario('u2')]);

    // Lunes 13/07/2026 00:00 La Paz.
    await servicio.procesarSesionCerrada(envelopeCierre(randomUUID(), '2026-07-13T04:00:00.000Z'));

    expect(bd.registros).toHaveLength(0);
    expect(publicados).toHaveLength(0);
  });

  it('SÍ castiga al cerrar la sesión del día que le tocaba', async () => {
    const bd = crearBd({ actividades: [CONFIRMABLE_MARTES()] });
    const { servicio, publicados } = crearServicio(bd, [usuario('u1'), usuario('u2')]);

    // Martes 14/07/2026 00:00 La Paz.
    await servicio.procesarSesionCerrada(envelopeCierre(randomUUID(), '2026-07-14T04:00:00.000Z'));

    expect(bd.registros).toHaveLength(2);
    expect(bd.registros[0]).toMatchObject({ tipo: 'NO_HIZO', valorPuntosSnapshot: -20 });
    expect(publicados).toHaveLength(2);
  });

  it('el día se evalúa en la timezone del Grupo: sesión del lunes 22:00 local (martes 02:00Z) es LUNES', async () => {
    const bd = crearBd({ actividades: [CONFIRMABLE_MARTES()] });
    const { servicio } = crearServicio(bd, [usuario('u1')]);

    await servicio.procesarSesionCerrada(envelopeCierre(randomUUID(), '2026-07-14T02:00:00.000Z'));

    expect(bd.registros).toHaveLength(0);
  });

  it('una obligatoria SIN programación se castiga cualquier día (comportamiento previo intacto)', async () => {
    const bd = crearBd({ actividades: [CONFIRMABLE_MARTES(), CONFIRMABLE()] });
    const { servicio } = crearServicio(bd, [usuario('u1')]);

    // Lunes: solo la no programada genera castigo.
    await servicio.procesarSesionCerrada(envelopeCierre(randomUUID(), '2026-07-13T04:00:00.000Z'));

    expect(bd.registros).toHaveLength(1);
    expect(bd.registros[0]).toMatchObject({ actividadId: 'obl-1' });
  });

  it('envelope sin fechaInicio (mensaje viejo): saltea las programadas y castiga las normales', async () => {
    const bd = crearBd({ actividades: [CONFIRMABLE_MARTES(), CONFIRMABLE()] });
    const { servicio } = crearServicio(bd, [usuario('u1')]);

    await servicio.procesarSesionCerrada(envelopeCierre(randomUUID(), undefined));

    expect(bd.registros).toHaveLength(1);
    expect(bd.registros[0]).toMatchObject({ actividadId: 'obl-1' });
  });
});
