import { randomUUID } from 'node:crypto';

import type { Seccion, Sesion } from '../../generated/prisma/client';
import type { ClientePrisma } from '../../prisma/prisma.service';

/**
 * SOLO PARA TESTS (*.spec.ts): implementación en memoria de los delegados de
 * modelo que usan MaquinaSeccionesService y SchedulerService, con el subset
 * de `where`/`orderBy` que esas queries emplean (igualdad, `{ not: ... }`,
 * orden por `numero`). Stateful a propósito: una transición que cierra una
 * sesión tiene que verse reflejada en la query siguiente del mismo flujo.
 */

type Fila = Record<string, unknown>;

interface Where {
  [campo: string]: unknown;
}

function matchea(fila: Fila, where: Where): boolean {
  return Object.entries(where).every(([campo, condicion]) => {
    if (condicion !== null && typeof condicion === 'object' && 'not' in condicion) {
      return fila[campo] !== (condicion as { not: unknown }).not;
    }

    return fila[campo] === condicion;
  });
}

function ordenar<T extends Fila>(filas: T[], orderBy?: { numero?: 'asc' | 'desc' }): T[] {
  if (!orderBy?.numero) {
    return filas;
  }

  const factor = orderBy.numero === 'desc' ? -1 : 1;

  return [...filas].sort((a, b) => ((a['numero'] as number) - (b['numero'] as number)) * factor);
}

function crearDelegado<T extends Fila>(filas: T[], defaults: () => Partial<T>) {
  return {
    findFirst: async (args: { where: Where; orderBy?: { numero?: 'asc' | 'desc' } }) => {
      const candidatas = ordenar(
        filas.filter((fila) => matchea(fila, args.where)),
        args.orderBy
      );

      return candidatas[0] ?? null;
    },
    findMany: async (args: { where?: Where; orderBy?: { numero?: 'asc' | 'desc' } } = {}) => {
      return ordenar(
        filas.filter((fila) => (args.where ? matchea(fila, args.where) : true)),
        args.orderBy
      );
    },
    create: async (args: { data: Partial<T> }) => {
      const fila = { ...defaults(), ...args.data } as T;

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

/**
 * Los delegados del fake implementan solo el subset de la API que usan las
 * queries bajo test — el cast a los tipos reales del cliente es el mismo
 * criterio `as unknown as X` de los mocks de los demás specs del monorepo.
 */
export type TxEnMemoria = Pick<ClientePrisma, 'seccion' | 'sesion' | 'ultimoTickProcesado'>;

export interface BdEnMemoria {
  secciones: Seccion[];
  sesiones: Sesion[];
  ticks: Map<string, { grupoId: string; minutoEpoch: number }>;
  tx: TxEnMemoria;
}

export function crearBdEnMemoria(datos: { secciones?: Seccion[]; sesiones?: Sesion[] } = {}): BdEnMemoria {
  const secciones: Seccion[] = [...(datos.secciones ?? [])];
  const sesiones: Sesion[] = [...(datos.sesiones ?? [])];
  const ticks = new Map<string, { grupoId: string; minutoEpoch: number }>();

  const tx = {
    seccion: crearDelegado<Seccion>(secciones, () => ({
      id: randomUUID(),
      estado: 'ABIERTA',
      fechaInicio: new Date(),
      fechaFin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    sesion: crearDelegado<Sesion>(sesiones, () => ({
      id: randomUUID(),
      estado: 'ABIERTA',
      fechaInicio: new Date(),
      fechaFin: null,
      autocierrePospuestoHasta: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    ultimoTickProcesado: {
      findUnique: async ({ where }: { where: { grupoId: string } }) =>
        ticks.get(where.grupoId) ?? null,
      upsert: async ({
        where,
        create,
      }: {
        where: { grupoId: string };
        create: { grupoId: string; minutoEpoch: number };
        update: { minutoEpoch: number };
      }) => {
        const fila = { grupoId: where.grupoId, minutoEpoch: create.minutoEpoch };

        ticks.set(where.grupoId, fila);

        return fila;
      },
    },
  } as unknown as TxEnMemoria;

  return { secciones, sesiones, ticks, tx };
}

export function seccionDePrueba(sobrescribir: Partial<Seccion> = {}): Seccion {
  return {
    id: randomUUID(),
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    numero: 1,
    estado: 'ABIERTA',
    fechaInicio: new Date('2026-07-13T04:00:00Z'),
    fechaFin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...sobrescribir,
  } as Seccion;
}

export function sesionDePrueba(sobrescribir: Partial<Sesion> = {}): Sesion {
  return {
    id: randomUUID(),
    seccionId: 'seccion-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    numero: 1,
    estado: 'ABIERTA',
    fechaInicio: new Date('2026-07-13T04:00:00Z'),
    fechaFin: null,
    autocierrePospuestoHasta: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...sobrescribir,
  } as Sesion;
}
