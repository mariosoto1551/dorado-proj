import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { EventEnvelope, SesionEventoPayload } from '@dorado/shared-events';
import type { UsuarioDto } from '@dorado/shared-types';

import type { IdentityClientService } from '../clientes/identity-client.service';
import { actividadDePrueba } from '../comun/testing/bd-registro-en-memoria';
import type { Actividad } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { SelladoTurnosService } from './sellado-turnos.service';

type Fila = Record<string, unknown>;

function matchea(fila: Fila, where: Fila): boolean {
  return Object.entries(where).every(([campo, condicion]) => {
    if (condicion && typeof condicion === 'object' && 'in' in (condicion as object)) {
      return (condicion as { in: unknown[] }).in.includes(fila[campo]);
    }

    return fila[campo] === condicion;
  });
}

/** El ejemplo de la spec: José recibe 2 de cada 4 turnos. */
const SECUENCIA = ['jose', 'luciana', 'jose', 'alejandra'];

const TURNO_ID = 'turno-1';

interface OpcionesBd {
  actividades?: Actividad[];
  posiciones?: string[];
  modo?: 'ORDEN_FIJO' | 'AZAR';
  frecuencia?: 'SESION' | 'SECCION';
  activo?: boolean;
  vueltas?: Fila[];
  asignaciones?: Fila[];
  procesados?: string[];
}

function crearBd(opciones: OpcionesBd = {}) {
  const asignaciones: Fila[] = [...(opciones.asignaciones ?? [])];
  const vueltas: Fila[] = [...(opciones.vueltas ?? [])];
  const eventoProcesado: Fila[] = (opciones.procesados ?? []).map((eventId) => ({ eventId }));

  const actividades = opciones.actividades ?? [
    actividadDePrueba({
      id: 'obl-basura',
      tipoPuntaje: 'OBLIGATORIA',
      comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
      valorPuntos: 10,
    }),
  ];

  const turnos: Fila[] =
    opciones.activo === false
      ? []
      : [
          {
            id: TURNO_ID,
            organizacionId: 'org-1',
            grupoId: 'grupo-1',
            actividadId: 'obl-basura',
            modo: opciones.modo ?? 'ORDEN_FIJO',
            frecuencia: opciones.frecuencia ?? 'SESION',
            activo: true,
          },
        ];

  const posiciones: Fila[] = (opciones.posiciones ?? SECUENCIA).map((usuarioId, orden) => ({
    turnoActividadId: TURNO_ID,
    orden,
    usuarioId,
  }));

  const client = {
    turnoActividad: {
      findMany: async ({ where }: { where: Fila }) =>
        turnos.filter((fila) => matchea(fila, where)),
    },
    actividad: {
      findMany: async ({ where }: { where: Fila }) =>
        actividades.filter((fila) => matchea(fila as Fila, where)),
    },
    posicionTurno: {
      findMany: async ({ where }: { where: Fila }) =>
        posiciones.filter((fila) => matchea(fila, where)),
    },
    vueltaTurno: {
      findFirst: async ({ where }: { where: Fila }) =>
        vueltas.find((fila) => matchea(fila, where)) ?? null,
      findFirstOrThrow: async ({ where }: { where: Fila }) => {
        const fila = vueltas.find((v) => matchea(v, where));

        if (!fila) {
          throw new Error('vuelta no encontrada');
        }

        return fila;
      },
      create: async ({ data }: { data: Fila }) => {
        if (vueltas.some((fila) => fila['numero'] === data['numero'])) {
          throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        }

        const fila = { id: randomUUID(), createdAt: new Date(), ...data };

        vueltas.push(fila);

        return fila;
      },
    },
    asignacionTurno: {
      findFirst: async ({ where, orderBy }: { where: Fila; orderBy?: unknown }) => {
        const encontradas = asignaciones.filter((fila) => matchea(fila, where));

        if (!orderBy) {
          return encontradas[0] ?? null;
        }

        // `orderBy: [{ vueltaNumero: desc }, { indice: desc }]` — la última.
        return (
          [...encontradas].sort(
            (a, b) =>
              Number(b['vueltaNumero']) - Number(a['vueltaNumero']) ||
              Number(b['indice']) - Number(a['indice'])
          )[0] ?? null
        );
      },
      create: async ({ data }: { data: Fila }) => {
        const fila = { id: randomUUID(), createdAt: new Date(), ...data };

        asignaciones.push(fila);

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
  };

  return { asignaciones, vueltas, prisma: { client } as unknown as PrismaService };
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
 * Lunes 13/07/2026 00:00 en La Paz, misma referencia que el resto de la suite.
 *
 * `null` = el payload viaja SIN `fechaInicio` (mensaje viejo en la cola). No se
 * usa `undefined` a propósito: activaría el valor por defecto del parámetro y el
 * test estaría probando lo contrario de lo que dice su nombre.
 */
function envelopeApertura(
  sesionId = 'sesion-1',
  fechaInicio: string | null = '2026-07-13T04:00:00.000Z'
): EventEnvelope<SesionEventoPayload> {
  return {
    eventId: randomUUID(),
    eventType: 'SesionAbierta',
    producedBy: 'session-service',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    occurredAt: new Date().toISOString(),
    correlationId: 'corr-1',
    payload: {
      sesionId,
      seccionId: 'seccion-1',
      organizacionId: 'org-1',
      grupoId: 'grupo-1',
      numero: 1,
      ...(fechaInicio !== null && { fechaInicio }),
    },
  };
}

function crearServicio(
  bd: ReturnType<typeof crearBd>,
  usuarios: UsuarioDto[] = [usuario('jose'), usuario('luciana'), usuario('alejandra')],
  rolesAsignados: Array<{ usuarioId: string; rolGrupoId: string | null }> = []
) {
  const identity = {
    usuariosDelGrupo: vi.fn().mockResolvedValue(usuarios),
    rolesAsignados: vi.fn().mockResolvedValue(rolesAsignados),
    obtenerGrupo: vi.fn().mockResolvedValue({
      id: 'grupo-1',
      organizacionId: 'org-1',
      nombre: 'Grupo Uno',
      timezone: 'America/La_Paz',
      createdAt: new Date().toISOString(),
    }),
  } as unknown as IdentityClientService;

  return { servicio: new SelladoTurnosService(bd.prisma, identity), identity };
}

describe('SelladoTurnosService — el patrón dinámico (fase-14-21)', () => {
  it('cuatro días seguidos: José, Luciana, José, Alejandra', async () => {
    // EL criterio del ítem: la secuencia se recorre literal, con repeticiones —
    // José recibe 2 de cada 4 turnos porque aparece dos veces en la lista.
    const bd = crearBd();
    const { servicio } = crearServicio(bd);

    for (let dia = 1; dia <= 4; dia++) {
      await servicio.procesarSesionAbierta(envelopeApertura(`sesion-${dia}`));
    }

    expect(bd.asignaciones.map((fila) => fila['usuarioId'])).toEqual([
      'jose',
      'luciana',
      'jose',
      'alejandra',
    ]);
  });

  it('al quinto día arranca la vuelta 2 y vuelve a José', async () => {
    const bd = crearBd();
    const { servicio } = crearServicio(bd);

    for (let dia = 1; dia <= 5; dia++) {
      await servicio.procesarSesionAbierta(envelopeApertura(`sesion-${dia}`));
    }

    expect(bd.asignaciones).toHaveLength(5);
    expect(bd.asignaciones[4]).toMatchObject({ usuarioId: 'jose', vueltaNumero: 2, indice: 0 });
    expect(bd.vueltas).toHaveLength(2);
  });

  it('la vuelta se sella entera al empezarla (decisión 15)', async () => {
    const bd = crearBd();
    const { servicio } = crearServicio(bd);

    await servicio.procesarSesionAbierta(envelopeApertura('sesion-1'));

    expect(bd.vueltas).toHaveLength(1);
    expect(bd.vueltas[0]).toMatchObject({ numero: 1, ordenUsuarioIds: SECUENCIA });
  });
});

describe('SelladoTurnosService — salteos y días sin turno', () => {
  it('saltea a quien ya no está en el grupo (decisión 14)', async () => {
    const bd = crearBd();
    // Luciana se fue: su turno pasa al siguiente de la lista, que es José.
    const { servicio } = crearServicio(bd, [usuario('jose'), usuario('alejandra')]);

    await servicio.procesarSesionAbierta(envelopeApertura('sesion-1'));
    await servicio.procesarSesionAbierta(envelopeApertura('sesion-2'));

    expect(bd.asignaciones.map((fila) => fila['usuarioId'])).toEqual(['jose', 'jose']);
    // El índice avanzó saltando la posición de Luciana.
    expect(bd.asignaciones[1]).toMatchObject({ indice: 2 });
  });

  it('saltea a quien no tiene el rol que la actividad exige (decisión 18)', async () => {
    const bd = crearBd({
      actividades: [
        actividadDePrueba({
          id: 'obl-basura',
          tipoPuntaje: 'OBLIGATORIA',
          comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
          rolesPermitidos: ['rol-limpieza'],
        }),
      ],
    });
    const { servicio } = crearServicio(
      bd,
      [usuario('jose'), usuario('luciana'), usuario('alejandra')],
      [
        { usuarioId: 'jose', rolGrupoId: null },
        { usuarioId: 'luciana', rolGrupoId: 'rol-limpieza' },
        { usuarioId: 'alejandra', rolGrupoId: 'rol-limpieza' },
      ]
    );

    await servicio.procesarSesionAbierta(envelopeApertura('sesion-1'));

    // José está primero en la lista pero no tiene el rol: le toca a Luciana.
    expect(bd.asignaciones[0]).toMatchObject({ usuarioId: 'luciana', indice: 1 });
  });

  it('nadie válido = ningún turno ese día (decisión 19)', async () => {
    const bd = crearBd();
    const { servicio } = crearServicio(bd, []);

    await servicio.procesarSesionAbierta(envelopeApertura('sesion-1'));

    expect(bd.asignaciones).toHaveLength(0);
  });

  it('un día NO programado no consume turno (decisión 9)', async () => {
    // La actividad solo corre los martes (2); la Sesión abre un lunes.
    const bd = crearBd({
      actividades: [
        actividadDePrueba({
          id: 'obl-basura',
          tipoPuntaje: 'OBLIGATORIA',
          comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
          diasSemana: [2],
        }),
      ],
    });
    const { servicio } = crearServicio(bd);

    await servicio.procesarSesionAbierta(envelopeApertura('sesion-1'));

    expect(bd.asignaciones).toHaveLength(0);
    // Tampoco se selló una vuelta: el cursor no se movió.
    expect(bd.vueltas).toHaveLength(0);
  });

  it('sin fechaInicio no se sella una programada (mensaje viejo en la cola)', async () => {
    const bd = crearBd({
      actividades: [
        actividadDePrueba({
          id: 'obl-basura',
          tipoPuntaje: 'OBLIGATORIA',
          comportamientoAlCierre: 'REQUIERE_CONFIRMACION',
          diasSemana: [1],
        }),
      ],
    });
    const { servicio } = crearServicio(bd);

    await servicio.procesarSesionAbierta(envelopeApertura('sesion-1', null));

    expect(bd.asignaciones).toHaveLength(0);
  });
});

describe('SelladoTurnosService — idempotencia y frecuencia', () => {
  it('reentregar el mismo evento no avanza el turno dos veces', async () => {
    // Importa por el #16: el scheduler con recuperación puede reentregar.
    const bd = crearBd();
    const { servicio } = crearServicio(bd);
    const envelope = envelopeApertura('sesion-1');

    await servicio.procesarSesionAbierta(envelope);
    await servicio.procesarSesionAbierta(envelope);

    expect(bd.asignaciones).toHaveLength(1);
  });

  it('dos sesiones distintas del scheduler sellan dos turnos, en orden', async () => {
    // El #16 reconcilia una ventana perdida abriendo varias sesiones seguidas.
    const bd = crearBd();
    const { servicio } = crearServicio(bd);

    await servicio.procesarSesionAbierta(envelopeApertura('sesion-1'));
    await servicio.procesarSesionAbierta(envelopeApertura('sesion-2'));

    expect(bd.asignaciones.map((fila) => fila['usuarioId'])).toEqual(['jose', 'luciana']);
  });

  it('con frecuencia SECCION, la 2ª Sesión de la semana no vuelve a sellar', async () => {
    const bd = crearBd({ frecuencia: 'SECCION' });
    const { servicio } = crearServicio(bd);

    await servicio.procesarSesionAbierta(envelopeApertura('sesion-1'));
    await servicio.procesarSesionAbierta(envelopeApertura('sesion-2'));

    expect(bd.asignaciones).toHaveLength(1);
    expect(bd.asignaciones[0]).toMatchObject({ ambitoId: 'seccion-1', usuarioId: 'jose' });
  });

  it('COSTO CERO: un grupo sin turnos activos no consulta identity', async () => {
    const bd = crearBd({ activo: false });
    const { servicio, identity } = crearServicio(bd);

    await servicio.procesarSesionAbierta(envelopeApertura('sesion-1'));

    expect(identity.usuariosDelGrupo).not.toHaveBeenCalled();
    expect(bd.asignaciones).toHaveLength(0);
  });

  it('en modo AZAR la vuelta conserva la proporción de la secuencia', async () => {
    const bd = crearBd({ modo: 'AZAR' });
    const { servicio } = crearServicio(bd);

    await servicio.procesarSesionAbierta(envelopeApertura('sesion-1'));

    const orden = bd.vueltas[0]['ordenUsuarioIds'] as string[];
    expect(orden).toHaveLength(4);
    expect(orden.filter((id) => id === 'jose')).toHaveLength(2);
  });
});
