import { randomUUID } from 'node:crypto';

import type {
  BolsaPremios,
  CanjeRecompensa,
  CastigoAsignado,
  Compra,
  ConfiguracionRecompensasGrupo,
  EtiquetaCatalogo,
  EventoMoneda,
  ItemBolsa,
  ProductoTienda,
  Recompensa,
  RendimientoZona,
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
  return Object.entries(where).every(([campo, condicion]) => {
    // Soporte mínimo de `{ in: [...] }` (fase-14-22: bolsas y productos filtran
    // por lista de ids). El resto sigue siendo igualdad estricta.
    if (condicion && typeof condicion === 'object' && 'in' in condicion) {
      return (condicion as { in: unknown[] }).in.includes(fila[campo]);
    }

    return fila[campo] === condicion;
  });
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
    // fase-14-26: la creación masiva de productos desde una etiqueta inserta
    // en lote. No valida duplicados a propósito — `createMany` de Prisma
    // tampoco los reporta fila por fila.
    createMany: async (args: { data: Partial<T>[] }) => {
      for (const dato of args.data) {
        filas.push({ ...defaults(), ...dato } as T);
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

/** Delegado con clave única sobre un campo arbitrario (ej. `umbralZonaId`). */
function crearDelegadoPorClave<T extends Fila>(
  filas: T[],
  clave: string,
  defaults: () => Partial<T>
) {
  const buscar = (valor: unknown) => filas.find((fila) => fila[clave] === valor);

  return {
    findFirst: async (args: { where: Where }) =>
      filas.find((fila) => matchea(fila, args.where)) ?? null,
    findMany: async (args: { where?: Where } = {}) =>
      filas.filter((fila) => (args.where ? matchea(fila, args.where) : true)),
    upsert: async (args: {
      where: Record<string, unknown>;
      create: Partial<T>;
      update: Partial<T>;
    }) => {
      const existente = buscar(args.where[clave]);

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
 * Delegado de `BolsaPremios`: como el service la lee siempre con
 * `include: { items: true }`, el fake tiene que resolver esa relación contra
 * el array de ItemBolsa.
 */
function crearDelegadoBolsas(bolsas: BolsaPremios[], items: ItemBolsa[]) {
  const conItems = (bolsa: BolsaPremios) => ({
    ...bolsa,
    items: items.filter((item) => item.bolsaId === bolsa.id),
  });

  return {
    findFirst: async (args: { where: Where }) => {
      const bolsa = bolsas.find((fila) => matchea(fila, args.where));

      return bolsa ? conItems(bolsa) : null;
    },
    findMany: async (args: { where?: Where } = {}) =>
      bolsas
        .filter((fila) => (args.where ? matchea(fila, args.where) : true))
        .map(conItems),
    create: async (args: {
      data: Partial<BolsaPremios> & { items?: { create: { recompensaId: string }[] } };
    }) => {
      const { items: relacion, ...datos } = args.data;
      const bolsa = {
        id: randomUUID(),
        estado: 'ACTIVA',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...datos,
      } as BolsaPremios;

      bolsas.push(bolsa);

      for (const item of relacion?.create ?? []) {
        items.push({
          id: randomUUID(),
          bolsaId: bolsa.id,
          recompensaId: item.recompensaId,
        } as ItemBolsa);
      }

      return conItems(bolsa);
    },
    updateMany: async (args: { where: Where; data: Partial<BolsaPremios> }) => {
      const afectadas = bolsas.filter((fila) => matchea(fila, args.where));

      for (const fila of afectadas) {
        Object.assign(fila, args.data);
      }

      return { count: afectadas.length };
    },
  };
}

/**
 * Delegado del objetivo de ahorro (fase-14-25). No usa `crearDelegado` porque
 * es el único modelo con clave compuesta `usuarioId_grupoId` y con `upsert`.
 */
function crearDelegadoObjetivos(filas: Fila[]) {
  const buscar = (where: { usuarioId_grupoId: { usuarioId: string; grupoId: string } }) =>
    filas.find(
      (fila) =>
        fila['usuarioId'] === where.usuarioId_grupoId.usuarioId &&
        fila['grupoId'] === where.usuarioId_grupoId.grupoId
    );

  return {
    findUnique: async (args: {
      where: { usuarioId_grupoId: { usuarioId: string; grupoId: string } };
    }) => buscar(args.where) ?? null,
    findMany: async (args: { where?: Where } = {}) =>
      filas.filter((fila) => (args.where ? matchea(fila, args.where) : true)),
    upsert: async (args: {
      where: { usuarioId_grupoId: { usuarioId: string; grupoId: string } };
      create: Fila;
      update: Fila;
    }) => {
      const existente = buscar(args.where);

      if (existente) {
        Object.assign(existente, args.update);

        return existente;
      }

      const fila = { id: randomUUID(), ...args.create };

      filas.push(fila);

      return fila;
    },
    deleteMany: async (args: { where: Where }) => {
      const sobreviven = filas.filter((fila) => !matchea(fila, args.where));
      const borradas = filas.length - sobreviven.length;

      filas.splice(0, filas.length, ...sobreviven);

      return { count: borradas };
    },
  };
}

/**
 * Delegado de la tabla de unión de etiquetas (fase-14-26). Misma forma que
 * `itemBolsa`: no lleva organizacionId/grupoId, cuelga por FK de dos tablas
 * que sí están filtradas.
 */
function crearDelegadoUnion(filas: Fila[]) {
  return {
    findMany: async (args: { where?: Where } = {}) =>
      filas.filter((fila) => (args.where ? matchea(fila, args.where) : true)),
    deleteMany: async (args: { where: Where }) => {
      const sobreviven = filas.filter((fila) => !matchea(fila, args.where));
      const borradas = filas.length - sobreviven.length;

      filas.splice(0, filas.length, ...sobreviven);

      return { count: borradas };
    },
    createMany: async (args: { data: Fila[] }) => {
      for (const fila of args.data) {
        filas.push({ id: randomUUID(), ...fila });
      }

      return { count: args.data.length };
    },
  };
}

export interface BdEnMemoria {
  recompensas: Recompensa[];
  canjes: CanjeRecompensa[];
  configuraciones: ConfiguracionRecompensasGrupo[];
  monedas: EventoMoneda[];
  rendimientos: RendimientoZona[];
  castigos: CastigoAsignado[];
  bolsas: BolsaPremios[];
  itemsBolsa: ItemBolsa[];
  productos: ProductoTienda[];
  compras: Compra[];
  /** fase-14-25: objetivos de ahorro (config, no ledger). */
  objetivos: Fila[];
  /** fase-14-26: catálogo de etiquetas y sus asignaciones. */
  etiquetas: EtiquetaCatalogo[];
  etiquetasEnRecompensa: Fila[];
  procesados: FilaEventoProcesado[];
  prisma: PrismaService;
}

export function crearBdEnMemoria(datos: {
  recompensas?: Recompensa[];
  canjes?: CanjeRecompensa[];
  configuraciones?: ConfiguracionRecompensasGrupo[];
  monedas?: EventoMoneda[];
  rendimientos?: RendimientoZona[];
  castigos?: CastigoAsignado[];
  bolsas?: BolsaPremios[];
  itemsBolsa?: ItemBolsa[];
  productos?: ProductoTienda[];
  compras?: Compra[];
  objetivos?: Fila[];
  etiquetas?: EtiquetaCatalogo[];
  etiquetasEnRecompensa?: Fila[];
} = {}): BdEnMemoria {
  const recompensas: Recompensa[] = [...(datos.recompensas ?? [])];
  const canjes: CanjeRecompensa[] = [...(datos.canjes ?? [])];
  const configuraciones: ConfiguracionRecompensasGrupo[] = [
    ...(datos.configuraciones ?? []),
  ];
  const monedas: EventoMoneda[] = [...(datos.monedas ?? [])];
  const rendimientos: RendimientoZona[] = [...(datos.rendimientos ?? [])];
  const castigos: CastigoAsignado[] = [...(datos.castigos ?? [])];
  const bolsas: BolsaPremios[] = [...(datos.bolsas ?? [])];
  const itemsBolsa: ItemBolsa[] = [...(datos.itemsBolsa ?? [])];
  const productos: ProductoTienda[] = [...(datos.productos ?? [])];
  const compras: Compra[] = [...(datos.compras ?? [])];
  const objetivos: Fila[] = [...(datos.objetivos ?? [])];
  const etiquetas: EtiquetaCatalogo[] = [...(datos.etiquetas ?? [])];
  const etiquetasEnRecompensa: Fila[] = [...(datos.etiquetasEnRecompensa ?? [])];
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
    // fase-14-26: catálogo de etiquetas, con el @@unique([grupoId, nombre]).
    etiquetaCatalogo: crearDelegado<EtiquetaCatalogo>(
      etiquetas,
      () => ({
        id: randomUUID(),
        estado: 'ACTIVA',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      (nueva, existente) =>
        nueva['grupoId'] === existente['grupoId'] && nueva['nombre'] === existente['nombre']
    ),
    etiquetaEnRecompensa: crearDelegadoUnion(etiquetasEnRecompensa),
    bolsaPremios: crearDelegadoBolsas(bolsas, itemsBolsa),
    itemBolsa: {
      findMany: async (args: { where?: Where } = {}) =>
        itemsBolsa.filter((fila) => (args.where ? matchea(fila, args.where) : true)),
      deleteMany: async (args: { where: Where }) => {
        const sobreviven = itemsBolsa.filter((fila) => !matchea(fila, args.where));
        const borradas = itemsBolsa.length - sobreviven.length;

        itemsBolsa.splice(0, itemsBolsa.length, ...sobreviven);

        return { count: borradas };
      },
      createMany: async (args: { data: Partial<ItemBolsa>[] }) => {
        for (const fila of args.data) {
          itemsBolsa.push({ id: randomUUID(), ...fila } as ItemBolsa);
        }

        return { count: args.data.length };
      },
    },
    productoTienda: crearDelegado<ProductoTienda>(productos, () => ({
      id: randomUUID(),
      descripcion: null,
      imagenUrl: null,
      mecanica: 'AZAR',
      recompensaId: null,
      bolsaId: null,
      estado: 'ACTIVA',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    // fase-14-25: el objetivo de ahorro. Es el único delegado con `upsert` —
    // el objetivo se pisa, no se versiona (decisión 3).
    objetivoParticipante: crearDelegadoObjetivos(objetivos),
    compra: crearDelegado<Compra>(compras, () => ({
      id: randomUUID(),
      estado: 'PENDIENTE_ENTREGA',
      entregadaPorTutorId: null,
      entregadaEn: null,
      revertidaEn: null,
      revertidaPorTutorId: null,
      motivoReversion: null,
      createdAt: new Date(),
    })),
    rendimientoZona: crearDelegadoPorClave<RendimientoZona>(
      rendimientos,
      'umbralZonaId',
      () => ({ id: randomUUID(), createdAt: new Date(), updatedAt: new Date() })
    ),
    castigoAsignado: crearDelegado<CastigoAsignado>(
      castigos,
      () => ({
        id: randomUUID(),
        estado: 'PENDIENTE_ENTREGA',
        entregadaPorTutorId: null,
        entregadaEn: null,
        anuladoEn: null,
        anuladoPorTutorId: null,
        motivoAnulacion: null,
        createdAt: new Date(),
      }),
      // @@unique([usuarioId, seccionId]) — la bancarrota se evalúa una sola vez.
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

  // El cierre económico corre TODO dentro de una transacción. Acá alcanza con
  // ejecutar el callback contra el mismo cliente: la atomicidad real la da
  // Postgres, y este helper solo tiene que dejar pasar la forma de la llamada.
  const clienteConTransaccion = {
    ...client,
    // El advisory lock de la compra. En memoria no hay concurrencia real que
    // serializar, así que es un no-op. OJO: este fake NO puede validar el SQL
    // —que la sentencia del lock sea correcta se verifica contra Postgres
    // real (misma advertencia que dejó el ítem #16).
    $executeRaw: async () => 0,
    $transaction: async <T>(fn: (tx: typeof client) => Promise<T>): Promise<T> =>
      await fn(clienteConTransaccion as unknown as typeof client),
  };

  return {
    recompensas,
    canjes,
    configuraciones,
    monedas,
    rendimientos,
    castigos,
    bolsas,
    itemsBolsa,
    productos,
    compras,
    objetivos,
    etiquetas,
    etiquetasEnRecompensa,
    procesados,
    prisma: { client: clienteConTransaccion } as unknown as PrismaService,
  };
}

export function etiquetaDePrueba(
  sobrescribir: Partial<EtiquetaCatalogo> = {}
): EtiquetaCatalogo {
  return {
    id: randomUUID(),
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    nombre: 'Pantalla',
    colorHex: '#8B5CF6',
    estado: 'ACTIVA',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...sobrescribir,
  } as EtiquetaCatalogo;
}

export function productoDePrueba(
  sobrescribir: Partial<ProductoTienda> = {}
): ProductoTienda {
  return {
    id: randomUUID(),
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    nombre: 'Producto',
    descripcion: null,
    imagenUrl: null,
    precio: 10,
    fuente: 'ITEM',
    mecanica: 'AZAR',
    recompensaId: null,
    bolsaId: null,
    estado: 'ACTIVA',
    creadoPorTutorId: 'tutor-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...sobrescribir,
  } as ProductoTienda;
}

export function rendimientoDePrueba(
  sobrescribir: Partial<RendimientoZona> = {}
): RendimientoZona {
  return {
    id: randomUUID(),
    organizacionId: 'org-1',
    grupoId: 'grupo-1',
    umbralZonaId: 'umbral-verde',
    nombreZonaSnapshot: 'Verde',
    monedas: 12,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...sobrescribir,
  } as RendimientoZona;
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
    tipo: 'PREMIO',
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
