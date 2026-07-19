import { randomUUID } from 'node:crypto';

import type { Notificacion } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * SOLO PARA TESTS (*.spec.ts): implementación en memoria de los delegados que
 * usan el consumidor y el service de notification (igualdad en `where`,
 * orderBy createdAt asc/desc, skip/take, P2002 en eventId). Mismo criterio
 * que session/scoring/rewards (fases 06-08).
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

interface FilaEventoProcesado extends Fila {
  eventId: string;
  consumidor: string;
}

export interface BdEnMemoria {
  notificaciones: Notificacion[];
  procesados: FilaEventoProcesado[];
  prisma: PrismaService;
}

export function crearBdEnMemoria(datos: { notificaciones?: Notificacion[] } = {}): BdEnMemoria {
  const notificaciones: Notificacion[] = [...(datos.notificaciones ?? [])];
  const procesados: FilaEventoProcesado[] = [];

  const delegadoNotificacion = {
    findFirst: async (args: { where: Where }) =>
      notificaciones.find((fila) => matchea(fila, args.where)) ?? null,
    findMany: async (args: {
      where?: Where;
      orderBy?: { createdAt?: 'asc' | 'desc' };
      skip?: number;
      take?: number;
    } = {}) => {
      let filas = notificaciones.filter((fila) =>
        args.where ? matchea(fila, args.where) : true
      );

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
      notificaciones.filter((fila) => (args.where ? matchea(fila, args.where) : true)).length,
    createMany: async (args: { data: Partial<Notificacion>[] }) => {
      for (const data of args.data) {
        notificaciones.push({
          id: randomUUID(),
          leida: false,
          createdAt: new Date(),
          ...data,
        } as Notificacion);
      }

      return { count: args.data.length };
    },
    updateMany: async (args: { where: Where; data: Partial<Notificacion> }) => {
      const afectadas = notificaciones.filter((fila) => matchea(fila, args.where));

      for (const fila of afectadas) {
        Object.assign(fila, args.data);
      }

      return { count: afectadas.length };
    },
  };

  const client = {
    notificacion: delegadoNotificacion,
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

  return { notificaciones, procesados, prisma: { client } as unknown as PrismaService };
}

export function notificacionDePrueba(sobrescribir: Partial<Notificacion> = {}): Notificacion {
  return {
    id: randomUUID(),
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    destinatarioId: 'usuario-1',
    destinatarioTipo: 'USUARIO',
    tipo: 'ZONA_ALCANZADA',
    mensaje: 'Mensaje de prueba',
    leida: false,
    createdAt: new Date(),
    ...sobrescribir,
  } as Notificacion;
}
