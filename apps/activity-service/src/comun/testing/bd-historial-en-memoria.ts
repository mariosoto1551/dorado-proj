import { randomUUID } from 'node:crypto';

import type {
  Actividad,
  Conducta,
  NotaRegistro,
  RegistroActividad,
  RegistroConducta,
  RegistroTareaEquipo,
} from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * SOLO PARA TESTS (*.spec.ts): BD en memoria del historial de la sesión
 * (fase-14-18). Separada de `bd-registro-en-memoria` a propósito: el historial
 * necesita `orderBy` + `take` + el `where` del cursor (`OR` con `lt`) +
 * `array_contains`, y agregarle todo eso al fake compartido cambiaría el
 * comportamiento de los tests que ya dependen de él.
 */

type Fila = Record<string, unknown>;

interface Where {
  [campo: string]: unknown;
}

function comparaCondicion(valor: unknown, condicion: unknown): boolean {
  if (condicion === null || typeof condicion !== 'object') {
    return valor === condicion;
  }

  // Igualdad por VALOR en fechas: el `where` del cursor compara contra un Date
  // reconstruido del ISO, que nunca es la misma instancia que la de la fila.
  if (condicion instanceof Date) {
    return valor instanceof Date && valor.getTime() === condicion.getTime();
  }

  const operadores = condicion as Record<string, unknown>;

  if ('in' in operadores) {
    return (operadores['in'] as unknown[]).includes(valor);
  }

  if ('lt' in operadores) {
    return esMenor(valor, operadores['lt']);
  }

  // `miembrosSnapshot: { array_contains: [{ usuarioId }] }` — contención
  // parcial, igual que el operador `@>` de jsonb en Postgres.
  if ('array_contains' in operadores) {
    const buscados = operadores['array_contains'] as Fila[];
    const elementos = Array.isArray(valor) ? (valor as Fila[]) : [];

    return buscados.every((buscado) =>
      elementos.some((elemento) =>
        Object.entries(buscado).every(([campo, esperado]) => elemento[campo] === esperado)
      )
    );
  }

  return valor === condicion;
}

/**
 * `lt` del cursor. Compara fechas por instante y **texto por texto**: el
 * desempate del cursor es por `id` (uuid), donde una comparación numérica da
 * NaN y silenciosamente no matchea nada.
 */
function esMenor(valor: unknown, limite: unknown): boolean {
  if (valor instanceof Date && limite instanceof Date) {
    return valor.getTime() < limite.getTime();
  }

  if (typeof valor === 'string' && typeof limite === 'string') {
    return valor < limite;
  }

  return Number(valor) < Number(limite);
}

function matchea(fila: Fila, where: Where): boolean {
  return Object.entries(where).every(([campo, condicion]) => {
    if (campo === 'OR') {
      return (condicion as Where[]).some((rama) => matchea(fila, rama));
    }

    if (campo === 'AND') {
      return (condicion as Where[]).every((rama) => matchea(fila, rama));
    }

    return comparaCondicion(fila[campo], condicion);
  });
}

type CriterioOrden = Record<string, 'asc' | 'desc'>;

type OrderBy = CriterioOrden | CriterioOrden[];

function ordenar<T extends Fila>(filas: T[], orderBy: OrderBy | undefined): T[] {
  // Prisma acepta un objeto o una lista; el historial usa las dos formas.
  const criterios = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];

  if (criterios.length === 0) {
    return filas;
  }

  return [...filas].sort((a, b) => {
    for (const criterio of criterios) {
      const [campo, direccion] = Object.entries(criterio)[0] as [string, 'asc' | 'desc'];
      const valorA = a[campo];
      const valorB = b[campo];
      let comparacion = 0;

      if (valorA instanceof Date && valorB instanceof Date) {
        comparacion = valorA.getTime() - valorB.getTime();
      } else {
        comparacion = String(valorA).localeCompare(String(valorB));
      }

      if (comparacion !== 0) {
        return direccion === 'desc' ? -comparacion : comparacion;
      }
    }

    return 0;
  });
}

interface ArgsFindMany {
  where?: Where;
  orderBy?: OrderBy;
  take?: number;
  select?: Record<string, boolean>;
}

function crearDelegado<T extends Fila>(filas: T[], defaults: () => Partial<T>) {
  return {
    findFirst: async (args: { where: Where }) =>
      filas.find((fila) => matchea(fila, args.where)) ?? null,
    findMany: async (args: ArgsFindMany = {}) => {
      const filtradas = filas.filter((fila) => (args.where ? matchea(fila, args.where) : true));
      const ordenadas = ordenar(filtradas, args.orderBy);

      return args.take === undefined ? ordenadas : ordenadas.slice(0, args.take);
    },
    create: async (args: { data: Partial<T> }) => {
      const fila = { ...defaults(), ...args.data } as T;

      filas.push(fila);

      return fila;
    },
    deleteMany: async (args: { where: Where }) => {
      const restantes = filas.filter((fila) => !matchea(fila, args.where));
      const eliminadas = filas.length - restantes.length;

      filas.length = 0;
      filas.push(...restantes);

      return { count: eliminadas };
    },
  };
}

export interface BdHistorialEnMemoria {
  actividades: Actividad[];
  conductas: Conducta[];
  registrosActividad: RegistroActividad[];
  registrosConducta: RegistroConducta[];
  registrosTareaEquipo: RegistroTareaEquipo[];
  notas: NotaRegistro[];
  prisma: PrismaService;
}

export function crearBdHistorialEnMemoria(
  datos: {
    actividades?: Actividad[];
    conductas?: Conducta[];
    registrosActividad?: RegistroActividad[];
    registrosConducta?: RegistroConducta[];
    registrosTareaEquipo?: RegistroTareaEquipo[];
    notas?: NotaRegistro[];
  } = {}
): BdHistorialEnMemoria {
  const actividades: Actividad[] = [...(datos.actividades ?? [])];
  const conductas: Conducta[] = [...(datos.conductas ?? [])];
  const registrosActividad: RegistroActividad[] = [...(datos.registrosActividad ?? [])];
  const registrosConducta: RegistroConducta[] = [...(datos.registrosConducta ?? [])];
  const registrosTareaEquipo: RegistroTareaEquipo[] = [...(datos.registrosTareaEquipo ?? [])];
  const notas: NotaRegistro[] = [...(datos.notas ?? [])];

  const client = {
    actividad: crearDelegado<Actividad>(actividades, () => ({ id: randomUUID() })),
    conducta: crearDelegado<Conducta>(conductas, () => ({ id: randomUUID() })),
    registroActividad: crearDelegado<RegistroActividad>(registrosActividad, () => ({
      id: randomUUID(),
      createdAt: new Date(),
    })),
    registroConducta: crearDelegado<RegistroConducta>(registrosConducta, () => ({
      id: randomUUID(),
      createdAt: new Date(),
    })),
    registroTareaEquipo: crearDelegado<RegistroTareaEquipo>(registrosTareaEquipo, () => ({
      id: randomUUID(),
      createdAt: new Date(),
    })),
    notaRegistro: crearDelegado<NotaRegistro>(notas, () => ({
      id: randomUUID(),
      createdAt: new Date(),
    })),
  };

  return {
    actividades,
    conductas,
    registrosActividad,
    registrosConducta,
    registrosTareaEquipo,
    notas,
    prisma: { client } as unknown as PrismaService,
  };
}
