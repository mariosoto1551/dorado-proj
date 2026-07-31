import { randomUUID } from 'node:crypto';

import type {
  Actividad,
  Conducta,
  CronometroActivo,
  RegistroActividad,
  RegistroConducta,
  AsignacionTurno,
  RegistroTareaEquipo,
  SeleccionPlanDia,
  TurnoActividad,
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
  return Object.entries(where).every(([campo, condicion]) => {
    // `OR: [{...}, {...}]` — necesario desde fase-14-10: el filtro de
    // visibilidad de actividades personales se expresa así.
    if (campo === 'OR') {
      return (condicion as Where[]).some((rama) => matchea(fila, rama));
    }

    // `campo: { in: [...] }` (lo usa listarCompletadasOpcionales).
    if (condicion !== null && typeof condicion === 'object' && 'in' in condicion) {
      return (condicion as { in: unknown[] }).in.includes(fila[campo]);
    }

    return fila[campo] === condicion;
  });
}

function crearDelegado<T extends Fila>(filas: T[], defaults: () => Partial<T>) {
  return {
    findFirst: async (args: { where: Where }) =>
      filas.find((fila) => matchea(fila, args.where)) ?? null,
    findMany: async (args: { where?: Where } = {}) =>
      filas.filter((fila) => (args.where ? matchea(fila, args.where) : true)),
    count: async (args: { where?: Where } = {}) =>
      filas.filter((fila) => (args.where ? matchea(fila, args.where) : true)).length,
    groupBy: async (args: { by: string[]; where?: Where }) => {
      const filtradas = filas.filter((fila) => (args.where ? matchea(fila, args.where) : true));
      const grupos = new Map<string, { clave: Record<string, unknown>; total: number }>();

      for (const fila of filtradas) {
        const claveStr = args.by.map((campo) => String(fila[campo])).join('::');
        const existente = grupos.get(claveStr);

        if (existente) {
          existente.total += 1;
        } else {
          const clave: Record<string, unknown> = {};

          for (const campo of args.by) {
            clave[campo] = fila[campo];
          }

          grupos.set(claveStr, { clave, total: 1 });
        }
      }

      return [...grupos.values()].map((grupo) => ({ ...grupo.clave, _count: { _all: grupo.total } }));
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
 * Misma forma para el cronómetro y para la selección del plan del día
 * (fase-14-17): las dos tablas se indexan por usuario + actividad + sesión.
 */
interface ClaveUsuarioActividadSesion {
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
  /** fase-14-13: completadas de tareas de equipo (anulables por el Tutor). */
  registrosTareaEquipo: RegistroTareaEquipo[];
  /** fase-14-17: qué opcionales eligió el integrante para hoy. */
  seleccionesPlanDia: SeleccionPlanDia[];
  /** fase-14-21: rotaciones configuradas; vacío = ninguna actividad rota. */
  turnos: TurnoActividad[];
  /** fase-14-21: a quién le tocó cada actividad en cada ámbito. */
  asignacionesTurno: AsignacionTurno[];
  prisma: PrismaService;
}

export function crearBdRegistroEnMemoria(datos: {
  actividades?: Actividad[];
  conductas?: Conducta[];
  registrosActividad?: RegistroActividad[];
  cronometros?: CronometroActivo[];
  registrosTareaEquipo?: RegistroTareaEquipo[];
  seleccionesPlanDia?: SeleccionPlanDia[];
  turnos?: TurnoActividad[];
  asignacionesTurno?: AsignacionTurno[];
} = {}): BdRegistroEnMemoria {
  const actividades: Actividad[] = [...(datos.actividades ?? [])];
  const conductas: Conducta[] = [...(datos.conductas ?? [])];
  const registrosActividad: RegistroActividad[] = [...(datos.registrosActividad ?? [])];
  const registrosConducta: RegistroConducta[] = [];
  const cronometros: CronometroActivo[] = [...(datos.cronometros ?? [])];
  const registrosTareaEquipo: RegistroTareaEquipo[] = [...(datos.registrosTareaEquipo ?? [])];
  const seleccionesPlanDia: SeleccionPlanDia[] = [...(datos.seleccionesPlanDia ?? [])];
  const turnos: TurnoActividad[] = [...(datos.turnos ?? [])];
  const asignacionesTurno: AsignacionTurno[] = [...(datos.asignacionesTurno ?? [])];

  const buscarCronometro = (clave: ClaveUsuarioActividadSesion): CronometroActivo | undefined =>
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
      eliminado: false,
      eliminadoPorTutorId: null,
      eliminadoEn: null,
      // fase-14-12: metadatos de la marca roja del tutor.
      motivoTutor: null,
      revertidoPorTutorId: null,
      revertidoEn: null,
      createdAt: new Date(),
    })),
    registroConducta: crearDelegado<RegistroConducta>(registrosConducta, () => ({
      id: randomUUID(),
      eliminado: false,
      eliminadoPorTutorId: null,
      eliminadoEn: null,
      createdAt: new Date(),
    })),
    registroTareaEquipo: crearDelegado<RegistroTareaEquipo>(registrosTareaEquipo, () => ({
      id: randomUUID(),
      // fase-14-13: metadatos de la anulación del Tutor.
      eliminado: false,
      eliminadoPorTutorId: null,
      eliminadoEn: null,
      motivoTutor: null,
      revertidoPorTutorId: null,
      revertidoEn: null,
      createdAt: new Date(),
    })),
    cronometroActivo: {
      findUnique: async ({
        where,
      }: {
        where: { usuarioId_actividadId_sesionId: ClaveUsuarioActividadSesion };
      }) => buscarCronometro(where.usuarioId_actividadId_sesionId) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { usuarioId_actividadId_sesionId: ClaveUsuarioActividadSesion };
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
    // fase-14-17: el plan del día. Mismo par upsert/deleteMany que el
    // cronómetro, más las lecturas (`findMany`) que consume mi-estado-hoy.
    seleccionPlanDia: {
      findMany: async (args: { where?: Where } = {}) =>
        seleccionesPlanDia.filter((fila) => (args.where ? matchea(fila, args.where) : true)),
      upsert: async ({
        where,
        create,
      }: {
        where: { usuarioId_actividadId_sesionId: ClaveUsuarioActividadSesion };
        create: Partial<SeleccionPlanDia>;
        update: Partial<SeleccionPlanDia>;
      }) => {
        const clave = where.usuarioId_actividadId_sesionId;
        const existente = seleccionesPlanDia.find(
          (fila) =>
            fila.usuarioId === clave.usuarioId &&
            fila.actividadId === clave.actividadId &&
            fila.sesionId === clave.sesionId
        );

        if (existente) {
          return existente;
        }

        const fila = { id: randomUUID(), createdAt: new Date(), ...create } as SeleccionPlanDia;

        seleccionesPlanDia.push(fila);

        return fila;
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const restantes = seleccionesPlanDia.filter((fila) => !matchea(fila, where));
        const eliminadas = seleccionesPlanDia.length - restantes.length;

        seleccionesPlanDia.length = 0;
        seleccionesPlanDia.push(...restantes);

        return { count: eliminadas };
      },
    },
    // fase-14-21: turnos rotativos. Con las listas vacías —el default— toda
    // obligatoria sigue siendo "de todos", que es el comportamiento previo al
    // ítem y el que asumen los tests que ya existían.
    turnoActividad: {
      findFirst: async ({ where }: { where: Where }) =>
        turnos.find((fila) => matchea(fila, where)) ?? null,
      findMany: async (args: { where?: Where } = {}) =>
        turnos.filter((fila) => (args.where ? matchea(fila, args.where) : true)),
    },
    asignacionTurno: {
      findFirst: async ({ where }: { where: Where }) =>
        asignacionesTurno.find((fila) => matchea(fila, where)) ?? null,
      findMany: async (args: { where?: Where } = {}) =>
        asignacionesTurno.filter((args_) => (args.where ? matchea(args_, args.where) : true)),
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
    registrosTareaEquipo,
    seleccionesPlanDia,
    turnos,
    asignacionesTurno,
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
    // fase-14-20: default 0 = confirmar no suma (comportamiento del ítem 8).
    puntosPorCumplir: 0,
    tipoLimiteTiempo: 'SIN_LIMITE',
    deadlineHora: null,
    duracionCronometroMinutos: null,
    repeticionesMaximasSesion: 1,
    repeticionesMaximasSeccion: null,
    comportamientoAlCierre: 'ASUME_HECHA',
    alcance: 'INDIVIDUAL',
    bonoJefePuntos: 0,
    // fase-14-11: sin programación = disponible todos los días.
    diasSemana: [],
    // fase-14-17: por defecto se elige (solo importa con el plan del día activo).
    siempreVisible: false,
    // fase-14-19: sin restricción de rol = la ven todos los del grupo.
    rolesPermitidos: [],
    estado: 'ACTIVA',
    // fase-14-10: por defecto es del catálogo del tutor (visible para todos).
    origen: 'TUTOR',
    creadaPorUsuarioId: null,
    creadaPorTutorId: 'tutor-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...sobrescribir,
  } as Actividad;
}

/**
 * Actividad PERSONAL de un integrante (fase-14-10): `origen = USUARIO` y con
 * dueño. Solo su autor la ve y la completa.
 */
export function actividadPersonalDePrueba(
  creadaPorUsuarioId: string,
  sobrescribir: Partial<Actividad> = {}
): Actividad {
  return actividadDePrueba({
    id: `actividad-de-${creadaPorUsuarioId}`,
    nombre: 'Practicar guitarra',
    origen: 'USUARIO',
    creadaPorUsuarioId,
    creadaPorTutorId: null,
    valorPuntos: 3,
    ...sobrescribir,
  } as Partial<Actividad>);
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
