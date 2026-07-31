import { randomUUID } from 'node:crypto';

import type {
  CanjeRecompensa,
  ConfiguracionRecompensasGrupo,
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

export interface BdEnMemoria {
  recompensas: Recompensa[];
  canjes: CanjeRecompensa[];
  configuraciones: ConfiguracionRecompensasGrupo[];
  procesados: FilaEventoProcesado[];
  prisma: PrismaService;
}

export function crearBdEnMemoria(datos: {
  recompensas?: Recompensa[];
  canjes?: CanjeRecompensa[];
  configuraciones?: ConfiguracionRecompensasGrupo[];
} = {}): BdEnMemoria {
  const recompensas: Recompensa[] = [...(datos.recompensas ?? [])];
  const canjes: CanjeRecompensa[] = [...(datos.canjes ?? [])];
  const configuraciones: ConfiguracionRecompensasGrupo[] = [
    ...(datos.configuraciones ?? []),
  ];
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
    procesados,
    prisma: { client } as unknown as PrismaService,
  };
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
