import { randomUUID } from 'node:crypto';

import type {
  Actividad,
  Conducta,
  CronometroActivo,
  RegistroActividad,
  RegistroConducta,
} from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * SOLO PARA TESTS (*.spec.ts): implementación en memoria de los delegados que
 * usa RegistroService, con el subset de operaciones de esas queries
 * (igualdad en `where`, count, upsert/findUnique por la clave compuesta del
 * cronómetro). Stateful a propósito — mismo criterio que session (fase-06).
 */

type Fila = Record<string, unknown>;

interface Where {
  [campo: string]: unknown;
}

function matchea(fila: Fila, where: Where): boolean {
  return Object.entries(where).every(([campo, condicion]) => fila[campo] === condicion);
}

function crearDelegado<T extends Fila>(filas: T[], defaults: () => Partial<T>) {
  return {
    findFirst: async (args: { where: Where }) =>
      filas.find((fila) => matchea(fila, args.where)) ?? null,
    findMany: async (args: { where?: Where } = {}) =>
      filas.filter((fila) => (args.where ? matchea(fila, args.where) : true)),
    count: async (args: { where?: Where } = {}) =>
      filas.filter((fila) => (args.where ? matchea(fila, args.where) : true)).length,
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

interface ClaveCronometro {
  usuarioId: string;
  actividadId: string;
  sesionId: string;
}

export interface BdRegistroEnMemoria {
  actividades: Actividad[];
  conductas: Conducta[];
  registrosActividad: RegistroActividad[];
  registrosConducta: RegistroConducta[];
  cronometros: CronometroActivo[];
  prisma: PrismaService;
}

export function crearBdRegistroEnMemoria(datos: {
  actividades?: Actividad[];
  conductas?: Conducta[];
  registrosActividad?: RegistroActividad[];
  cronometros?: CronometroActivo[];
} = {}): BdRegistroEnMemoria {
  const actividades: Actividad[] = [...(datos.actividades ?? [])];
  const conductas: Conducta[] = [...(datos.conductas ?? [])];
  const registrosActividad: RegistroActividad[] = [...(datos.registrosActividad ?? [])];
  const registrosConducta: RegistroConducta[] = [];
  const cronometros: CronometroActivo[] = [...(datos.cronometros ?? [])];

  const buscarCronometro = (clave: ClaveCronometro): CronometroActivo | undefined =>
    cronometros.find(
      (fila) =>
        fila.usuarioId === clave.usuarioId &&
        fila.actividadId === clave.actividadId &&
        fila.sesionId === clave.sesionId
    );

  const client = {
    actividad: crearDelegado<Actividad>(actividades, () => ({ id: randomUUID() })),
    conducta: crearDelegado<Conducta>(conductas, () => ({ id: randomUUID() })),
    registroActividad: crearDelegado<RegistroActividad>(registrosActividad, () => ({
      id: randomUUID(),
      createdAt: new Date(),
    })),
    registroConducta: crearDelegado<RegistroConducta>(registrosConducta, () => ({
      id: randomUUID(),
      eliminado: false,
      eliminadoPorTutorId: null,
      eliminadoEn: null,
      createdAt: new Date(),
    })),
    cronometroActivo: {
      findUnique: async ({
        where,
      }: {
        where: { usuarioId_actividadId_sesionId: ClaveCronometro };
      }) => buscarCronometro(where.usuarioId_actividadId_sesionId) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { usuarioId_actividadId_sesionId: ClaveCronometro };
        create: Partial<CronometroActivo>;
        update: Partial<CronometroActivo>;
      }) => {
        const existente = buscarCronometro(where.usuarioId_actividadId_sesionId);

        if (existente) {
          Object.assign(existente, update);

          return existente;
        }

        const fila = { id: randomUUID(), iniciadoEn: new Date(), ...create } as CronometroActivo;

        cronometros.push(fila);

        return fila;
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const restantes = cronometros.filter((fila) => !matchea(fila, where));
        const eliminadas = cronometros.length - restantes.length;

        cronometros.length = 0;
        cronometros.push(...restantes);

        return { count: eliminadas };
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      // Sin rollback: suficiente para los flujos bajo test.
      return await fn(client);
    },
  };

  return {
    actividades,
    conductas,
    registrosActividad,
    registrosConducta,
    cronometros,
    prisma: { client } as unknown as PrismaService,
  };
}

export function actividadDePrueba(sobrescribir: Partial<Actividad> = {}): Actividad {
  return {
    id: 'actividad-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    nombre: 'Leer 30 minutos',
    descripcion: null,
    tipoPuntaje: 'OPCIONAL',
    valorPuntos: 10,
    tipoLimiteTiempo: 'SIN_LIMITE',
    deadlineHora: null,
    duracionCronometroMinutos: null,
    repeticionesMaximasSesion: 1,
    repeticionesMaximasSeccion: null,
    estado: 'ACTIVA',
    creadaPorTutorId: 'tutor-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...sobrescribir,
  } as Actividad;
}

export function conductaDePrueba(sobrescribir: Partial<Conducta> = {}): Conducta {
  return {
    id: 'conducta-1',
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    nombre: 'Pelea',
    tipo: 'MALA',
    valorPuntos: 5,
    permiteAutoreporte: true,
    estado: 'ACTIVA',
    creadaPorTutorId: 'tutor-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...sobrescribir,
  } as Conducta;
}
