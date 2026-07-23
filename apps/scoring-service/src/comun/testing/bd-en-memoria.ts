import { randomUUID } from 'node:crypto';

import type {
  DescalificacionSeccion,
  EventoPuntos,
  ResultadoSeccion,
  UmbralZona,
} from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * SOLO PARA TESTS (*.spec.ts): implementación en memoria de los delegados de
 * modelo que usan los services de scoring, con el subset de operaciones que
 * esas queries emplean (igualdad en `where`, orderBy por `orden`, groupBy y
 * aggregate con `_sum.puntosSnapshot`, P2002 en los únicos). Stateful a
 * propósito: la proyección de un evento tiene que verse en la evaluación
 * siguiente del mismo flujo. Mismo criterio que session (fase-06).
 */

type Fila = Record<string, unknown>;

interface Where {
  [campo: string]: unknown;
}

function matchea(fila: Fila, where: Where): boolean {
  return Object.entries(where).every(([campo, condicion]) => fila[campo] === condicion);
}

function ordenarPorOrden<T extends Fila>(filas: T[], orderBy?: { orden?: 'asc' | 'desc' }): T[] {
  if (!orderBy?.orden) {
    return filas;
  }

  const factor = orderBy.orden === 'desc' ? -1 : 1;

  return [...filas].sort((a, b) => ((a['orden'] as number) - (b['orden'] as number)) * factor);
}

function errorP2002(): Error {
  const error = new Error('Unique constraint failed') as Error & { code: string };
  error.code = 'P2002';

  return error;
}

function crearDelegado<T extends Fila>(
  filas: T[],
  defaults: () => Partial<T>,
  esDuplicada?: (nueva: T, existente: T) => boolean
) {
  return {
    findFirst: async (args: { where: Where; orderBy?: { orden?: 'asc' | 'desc' } }) => {
      const candidatas = ordenarPorOrden(
        filas.filter((fila) => matchea(fila, args.where)),
        args.orderBy
      );

      return candidatas[0] ?? null;
    },
    findMany: async (args: { where?: Where; orderBy?: { orden?: 'asc' | 'desc' } } = {}) => {
      return ordenarPorOrden(
        filas.filter((fila) => (args.where ? matchea(fila, args.where) : true)),
        args.orderBy
      );
    },
    count: async (args: { where?: Where } = {}) => {
      return filas.filter((fila) => (args.where ? matchea(fila, args.where) : true)).length;
    },
    create: async (args: { data: Partial<T> }) => {
      const fila = { ...defaults(), ...args.data } as T;

      if (esDuplicada && filas.some((existente) => esDuplicada(fila, existente))) {
        throw errorP2002();
      }

      filas.push(fila);

      return fila;
    },
    createMany: async (args: { data: Partial<T>[] }) => {
      for (const data of args.data) {
        const fila = { ...defaults(), ...data } as T;

        if (esDuplicada && filas.some((existente) => esDuplicada(fila, existente))) {
          throw errorP2002();
        }

        filas.push(fila);
      }

      return { count: args.data.length };
    },
    updateMany: async (args: { where: Where; data: Partial<T> }) => {
      const afectadas = filas.filter((fila) => matchea(fila, args.where));

      for (const fila of afectadas) {
        Object.assign(fila, args.data);
      }

      return { count: afectadas.length };
    },
    deleteMany: async (args: { where: Where }) => {
      const restantes = filas.filter((fila) => !matchea(fila, args.where));
      const eliminadas = filas.length - restantes.length;

      filas.length = 0;
      filas.push(...restantes);

      return { count: eliminadas };
    },
    groupBy: async (args: {
      by: string[];
      where?: Where;
      _sum?: { puntosSnapshot?: boolean };
    }) => {
      const grupos = new Map<string, number>();
      const campo = args.by[0];

      for (const fila of filas) {
        if (args.where && !matchea(fila, args.where)) {
          continue;
        }

        const clave = fila[campo] as string;
        grupos.set(clave, (grupos.get(clave) ?? 0) + ((fila['puntosSnapshot'] as number) ?? 0));
      }

      return [...grupos.entries()].map(([clave, suma]) => ({
        [campo]: clave,
        _sum: { puntosSnapshot: suma },
      }));
    },
    aggregate: async (args: { where?: Where; _sum?: { puntosSnapshot?: boolean } }) => {
      const relevantes = filas.filter((fila) => (args.where ? matchea(fila, args.where) : true));

      if (relevantes.length === 0) {
        return { _sum: { puntosSnapshot: null } };
      }

      return {
        _sum: {
          puntosSnapshot: relevantes.reduce(
            (total, fila) => total + ((fila['puntosSnapshot'] as number) ?? 0),
            0
          ),
        },
      };
    },
  };
}

interface FilaEventoProcesado extends Fila {
  eventId: string;
  consumidor: string;
}

interface FilaConfiguracion extends Fila {
  grupoId: string;
  organizacionId: string;
  puntosIniciales: number;
}

export interface BdEnMemoria {
  eventosPuntos: EventoPuntos[];
  umbrales: UmbralZona[];
  descalificaciones: DescalificacionSeccion[];
  resultados: ResultadoSeccion[];
  configuraciones: FilaConfiguracion[];
  procesados: FilaEventoProcesado[];
  /** Doble de PrismaService (client + $transaction sobre los mismos arrays). */
  prisma: PrismaService;
}

export function crearBdEnMemoria(datos: {
  eventosPuntos?: EventoPuntos[];
  umbrales?: UmbralZona[];
  descalificaciones?: DescalificacionSeccion[];
  resultados?: ResultadoSeccion[];
  configuraciones?: FilaConfiguracion[];
} = {}): BdEnMemoria {
  const eventosPuntos: EventoPuntos[] = [...(datos.eventosPuntos ?? [])];
  const umbrales: UmbralZona[] = [...(datos.umbrales ?? [])];
  const descalificaciones: DescalificacionSeccion[] = [...(datos.descalificaciones ?? [])];
  const resultados: ResultadoSeccion[] = [...(datos.resultados ?? [])];
  const configuraciones: FilaConfiguracion[] = [...(datos.configuraciones ?? [])];
  const procesados: FilaEventoProcesado[] = [];

  const client = {
    eventoPuntos: crearDelegado<EventoPuntos>(eventosPuntos, () => ({
      id: randomUUID(),
      corregidoDeId: null,
      motivoCorreccion: null,
      createdAt: new Date(),
    })),
    umbralZona: crearDelegado<UmbralZona>(
      umbrales,
      () => ({ id: randomUUID(), createdAt: new Date(), updatedAt: new Date() }),
      (nueva, existente) =>
        nueva['grupoId'] === existente['grupoId'] && nueva['orden'] === existente['orden']
    ),
    descalificacionSeccion: crearDelegado<DescalificacionSeccion>(
      descalificaciones,
      () => ({ id: randomUUID(), createdAt: new Date() }),
      (nueva, existente) =>
        nueva['usuarioId'] === existente['usuarioId'] &&
        nueva['seccionId'] === existente['seccionId']
    ),
    resultadoSeccion: crearDelegado<ResultadoSeccion>(
      resultados,
      () => ({ id: randomUUID(), descalificado: false, calculadoEn: new Date() }),
      (nueva, existente) =>
        nueva['usuarioId'] === existente['usuarioId'] &&
        nueva['seccionId'] === existente['seccionId']
    ),
    configuracionScoringGrupo: {
      findUnique: async ({ where }: { where: { grupoId: string } }) =>
        configuraciones.find((fila) => fila.grupoId === where.grupoId) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { grupoId: string };
        create: FilaConfiguracion;
        update: Partial<FilaConfiguracion>;
      }) => {
        const existente = configuraciones.find((fila) => fila.grupoId === where.grupoId);

        if (existente) {
          Object.assign(existente, update);

          return existente;
        }

        const fila = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...create };

        configuraciones.push(fila);

        return fila;
      },
    },
    eventoProcesado: {
      findUnique: async ({ where }: { where: { eventId: string } }) =>
        procesados.find((fila) => fila.eventId === where.eventId) ?? null,
      create: async ({ data }: { data: FilaEventoProcesado }) => {
        if (procesados.some((fila) => fila.eventId === data.eventId)) {
          throw errorP2002();
        }

        procesados.push(data);

        return data;
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      // Sin rollback: suficiente para los flujos bajo test (mismo criterio
      // que el fake de session fase-06).
      return await fn(client);
    },
  };

  return {
    eventosPuntos,
    umbrales,
    descalificaciones,
    resultados,
    configuraciones,
    procesados,
    prisma: { client } as unknown as PrismaService,
  };
}

export function umbralDePrueba(sobrescribir: Partial<UmbralZona> = {}): UmbralZona {
  return {
    id: randomUUID(),
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    nombreZona: 'Zona',
    orden: 1,
    puntosMin: 0,
    puntosMax: null,
    colorHex: '#EF4444',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...sobrescribir,
  } as UmbralZona;
}

export function eventoPuntosDePrueba(sobrescribir: Partial<EventoPuntos> = {}): EventoPuntos {
  return {
    id: randomUUID(),
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    usuarioId: 'usuario-1',
    seccionId: 'seccion-1',
    sesionId: 'sesion-1',
    tipoOrigen: 'ACTIVIDAD_COMPLETADA',
    origenId: 'registro-1',
    puntosSnapshot: 10,
    registradoPorId: 'tutor-1',
    registradoPorTipo: 'TUTOR',
    corregidoDeId: null,
    motivoCorreccion: null,
    createdAt: new Date(),
    ...sobrescribir,
  } as EventoPuntos;
}
