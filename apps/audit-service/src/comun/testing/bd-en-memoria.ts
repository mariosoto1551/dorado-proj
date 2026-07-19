import { randomUUID } from 'node:crypto';

import type { RegistroAuditoria } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * SOLO PARA TESTS (*.spec.ts): implementación en memoria de los delegados que
 * usa el consumidor y el service de audit — igualdad en `where`, rango de
 * `createdAt` (gte/lte), orderBy createdAt asc/desc, skip/take, P2002 en
 * eventId. Mismo criterio que los demás servicios (fases 06-09).
 */

type Fila = Record<string, unknown>;

interface Where {
  [campo: string]: unknown;
}

function matchea(fila: Fila, where: Where): boolean {
  return Object.entries(where).every(([campo, condicion]) => {
    if (campo === 'createdAt' && condicion && typeof condicion === 'object') {
      const rango = condicion as { gte?: Date; lte?: Date };
      const valor = fila['createdAt'] as Date;

      if (rango.gte && valor < rango.gte) {
        return false;
      }

      if (rango.lte && valor > rango.lte) {
        return false;
      }

      return true;
    }

    return fila[campo] === condicion;
  });
}

function errorP2002(): Error {
  const error = new Error('Unique constraint failed') as Error & { code: string };
  error.code = 'P2002';

  return error;
}

interface FilaEventoProcesado extends Fila {
  eventId: string;
  consumidor: string;
}

export interface BdEnMemoria {
  registros: RegistroAuditoria[];
  procesados: FilaEventoProcesado[];
  prisma: PrismaService;
}

export function crearBdEnMemoria(datos: { registros?: RegistroAuditoria[] } = {}): BdEnMemoria {
  const registros: RegistroAuditoria[] = [...(datos.registros ?? [])];
  const procesados: FilaEventoProcesado[] = [];

  const client = {
    registroAuditoria: {
      findMany: async (args: {
        where?: Where;
        orderBy?: { createdAt?: 'asc' | 'desc' };
        skip?: number;
        take?: number;
      } = {}) => {
        let filas = registros.filter((fila) => (args.where ? matchea(fila, args.where) : true));

        if (args.orderBy?.createdAt) {
          const factor = args.orderBy.createdAt === 'desc' ? -1 : 1;
          filas = [...filas].sort(
            (a, b) => (a.createdAt.getTime() - b.createdAt.getTime()) * factor
          );
        }

        const desde = args.skip ?? 0;

        return filas.slice(desde, args.take !== undefined ? desde + args.take : undefined);
      },
      count: async (args: { where?: Where } = {}) =>
        registros.filter((fila) => (args.where ? matchea(fila, args.where) : true)).length,
      create: async (args: { data: Partial<RegistroAuditoria> }) => {
        const fila = { id: randomUUID(), createdAt: new Date(), ...args.data } as RegistroAuditoria;

        registros.push(fila);

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
      // Sin rollback: suficiente para los flujos bajo test.
      return await fn(client);
    },
  };

  return { registros, procesados, prisma: { client } as unknown as PrismaService };
}

export function registroDePrueba(sobrescribir: Partial<RegistroAuditoria> = {}): RegistroAuditoria {
  return {
    id: randomUUID(),
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    actorId: 'tutor-1',
    actorTipo: 'TUTOR',
    accion: 'ACTIVIDAD_CREADA',
    entidadTipo: 'Actividad',
    entidadId: 'act-1',
    detalle: {},
    createdAt: new Date(),
    ...sobrescribir,
  } as RegistroAuditoria;
}
