import { randomUUID } from 'node:crypto';

import type {
  CanjeRecompensa,
  ConfiguracionRecompensasGrupo,
  EventoMoneda,
  Recompensa,
} from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * SOLO PARA TESTS (*.spec.ts): implementación en memoria de los delegados que
 * usan los services de rewards, con el subset de operaciones de esas queries
 * (igualdad en `where`, P2002 en los únicos). El orden de inserción hace de
 * `orderBy createdAt` — suficiente para los flujos bajo test. Mismo criterio
 * que session/scoring (fases 06/07).
 */

type Fila = Record<string, unknown>;

interface Where {
  [campo: string]: unknown;
}

function matchea(fila: Fila, where: Where): boolean {
  return Object.entries(where).every(([campo, condicion]) => fila[campo] === condicion);
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
    findFirst: async (args: { where: Where }) =>
      filas.find((fila) => matchea(fila, args.where)) ?? null,
    findMany: async (args: { where?: Where } = {}) =>
      filas.filter((fila) => (args.where ? matchea(fila, args.where) : true)),
    create: async (args: { data: Partial<T> }) => {
      const fila = { ...defaults(), ...args.data } as T;

      if (esDuplicada && filas.some((existente) => esDuplicada(fila, existente))) {
        throw errorP2002();
      }

      filas.push(fila);

      return fila;
    },
    updateMany: async (args: { where: Where; data: Partial<T> }) => {
      const afectadas = filas.filter((fila) => matchea(fila, args.where));

      for (const fila of afectadas) {
        Object.assign(fila, args.data);
      }

      return { count: afectadas.length };
    },
  };
}

interface FilaEventoProcesado extends Fila {
  eventId: string;
  consumidor: string;
}

/**
 * Delegado con la forma que necesita `ConfiguracionRecompensasGrupo`
 * (fase-14-22): clave única `grupoId`, con `findUnique`/`upsert`/`update`.
 * El delegado genérico no sirve acá — ese trabaja con `findFirst`/`updateMany`.
 */
function crearDelegadoPorGrupo<T extends Fila>(filas: T[], defaults: () => Partial<T>) {
  const buscar = (grupoId: string) => filas.find((fila) => fila['grupoId'] === grupoId);

  return {
    findUnique: async (args: { where: { grupoId: string } }) =>
      buscar(args.where.grupoId) ?? null,
    create: async (args: { data: Partial<T> }) => {
      const fila = { ...defaults(), ...args.data } as T;

      if (buscar(fila['grupoId'] as string)) {
        throw errorP2002();
      }

      filas.push(fila);

      return fila;
    },
    update: async (args: { where: { grupoId: string }; data: Partial<T> }) => {
      const fila = buscar(args.where.grupoId);

      if (!fila) {
        throw new Error('Fila no encontrada');
      }

      Object.assign(fila, args.data);

      return fila;
    },
    upsert: async (args: {
      where: { grupoId: string };
      create: Partial<T>;
      update: Partial<T>;
    }) => {
      const existente = buscar(args.where.grupoId);

      if (existente) {
        Object.assign(existente, args.update);

        return existente;
      }

      const fila = { ...defaults(), ...args.create } as T;

      filas.push(fila);

      return fila;
    },
  };
}

/**
 * Delegado del LEDGER de monedas (fase-14-22). Solo `create`, `findMany`,
 * `count`, `aggregate` y `groupBy`: no expone `update` ni `delete` **a
 * propósito** — si un test los necesitara, el bug estaría en el código bajo
 * test, no acá (regla 1: el ledger solo crece).
 */
function crearDelegadoLedger<T extends Fila>(filas: T[], defaults: () => Partial<T>) {
  const filtrar = (where?: Where) =>
    filas.filter((fila) => (where ? matchea(fila, where) : true));

  const ordenar = (encontradas: T[], orderBy?: { createdAt?: 'asc' | 'desc' }) => {
    if (orderBy?.createdAt !== 'desc') {
      return encontradas;
    }

    return [...encontradas].reverse();
  };

  return {
    create: async (args: { data: Partial<T>; select?: Record<string, boolean> }) => {
      const fila = { ...defaults(), ...args.data } as T;

      filas.push(fila);

      return fila;
    },
    findMany: async (
      args: {
        where?: Where;
        orderBy?: { createdAt?: 'asc' | 'desc' };
        skip?: number;
        take?: number;
      } = {}
    ) => {
      const encontradas = ordenar(filtrar(args.where), args.orderBy);
      const desde = args.skip ?? 0;

      return args.take === undefined
        ? encontradas.slice(desde)
        : encontradas.slice(desde, desde + args.take);
    },
    count: async (args: { where?: Where } = {}) => filtrar(args.where).length,
    aggregate: async (args: { where?: Where; _sum?: { monto?: boolean } }) => ({
      _sum: {
        monto: filtrar(args.where).reduce(
          (total, fila) => total + ((fila['monto'] as number) ?? 0),
          0
        ),
      },
    }),
    groupBy: async (args: { by: string[]; where?: Where; _sum?: { monto?: boolean } }) => {
      const campo = args.by[0];
      const porClave = new Map<unknown, number>();

      for (const fila of filtrar(args.where)) {
        const clave = fila[campo];

        porClave.set(clave, (porClave.get(clave) ?? 0) + ((fila['monto'] as number) ?? 0));
      }

      return [...porClave.entries()].map(([clave, monto]) => ({
        [campo]: clave,
        _sum: { monto },
      }));
    },
  };
}

export interface BdEnMemoria {
  recompensas: Recompensa[];
  canjes: CanjeRecompensa[];
  configuraciones: ConfiguracionRecompensasGrupo[];
  monedas: EventoMoneda[];
  procesados: FilaEventoProcesado[];
  prisma: PrismaService;
}

export function crearBdEnMemoria(datos: {
  recompensas?: Recompensa[];
  canjes?: CanjeRecompensa[];
  configuraciones?: ConfiguracionRecompensasGrupo[];
  monedas?: EventoMoneda[];
} = {}): BdEnMemoria {
  const recompensas: Recompensa[] = [...(datos.recompensas ?? [])];
  const canjes: CanjeRecompensa[] = [...(datos.canjes ?? [])];
  const configuraciones: ConfiguracionRecompensasGrupo[] = [
    ...(datos.configuraciones ?? []),
  ];
  const monedas: EventoMoneda[] = [...(datos.monedas ?? [])];
  const procesados: FilaEventoProcesado[] = [];

  const client = {
    recompensa: crearDelegado<Recompensa>(recompensas, () => ({
      id: randomUUID(),
      descripcion: null,
      imagenUrl: null,
      permiteSeleccion: false,
      permiteAzar: false,
      estado: 'ACTIVA',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    canjeRecompensa: crearDelegado<CanjeRecompensa>(
      canjes,
      () => ({
        id: randomUUID(),
        estado: 'PENDIENTE_ENTREGA',
        entregadaPorTutorId: null,
        entregadaEn: null,
        createdAt: new Date(),
      }),
      // @@unique([usuarioId, seccionId]) — un canje por usuario por Sección.
      (nueva, existente) =>
        nueva['usuarioId'] === existente['usuarioId'] &&
        nueva['seccionId'] === existente['seccionId']
    ),
    eventoMoneda: crearDelegadoLedger<EventoMoneda>(monedas, () => ({
      id: randomUUID(),
      seccionId: null,
      origenId: null,
      motivo: null,
      createdAt: new Date(),
    })),
    configuracionRecompensasGrupo: crearDelegadoPorGrupo<ConfiguracionRecompensasGrupo>(
      configuraciones,
      () => ({
        id: randomUUID(),
        modo: 'DIRECTO',
        modoPendiente: null,
        nombreMoneda: 'monedas',
        iconoMoneda: '🪙',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ),
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
  };

  return {
    recompensas,
    canjes,
    configuraciones,
    monedas,
    procesados,
    prisma: { client } as unknown as PrismaService,
  };
}

export function movimientoDePrueba(
  sobrescribir: Partial<EventoMoneda> = {}
): EventoMoneda {
  return {
    id: randomUUID(),
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    usuarioId: 'usuario-1',
    tipo: 'RENDIMIENTO_ZONA',
    monto: 10,
    seccionId: null,
    origenId: null,
    motivo: null,
    registradoPorId: 'SYSTEM',
    registradoPorTipo: 'SYSTEM',
    createdAt: new Date(),
    ...sobrescribir,
  } as EventoMoneda;
}

export function configuracionDePrueba(
  sobrescribir: Partial<ConfiguracionRecompensasGrupo> = {}
): ConfiguracionRecompensasGrupo {
  return {
    id: randomUUID(),
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    modo: 'DIRECTO',
    modoPendiente: null,
    nombreMoneda: 'monedas',
    iconoMoneda: '🪙',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...sobrescribir,
  } as ConfiguracionRecompensasGrupo;
}

export function recompensaDePrueba(sobrescribir: Partial<Recompensa> = {}): Recompensa {
  return {
    id: randomUUID(),
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    umbralZonaId: 'umbral-dorado',
    nombreZonaSnapshot: 'Dorado',
    nombre: 'Recompensa',
    descripcion: null,
    imagenUrl: null,
    permiteSeleccion: false,
    permiteAzar: false,
    estado: 'ACTIVA',
    creadaPorTutorId: 'tutor-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...sobrescribir,
  } as Recompensa;
}
