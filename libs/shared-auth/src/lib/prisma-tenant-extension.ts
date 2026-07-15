import type { TenantContext } from '@dorado/shared-types';

import { getTenantContext } from './tenant.storage';

/** Configuración de un modelo tenant-scoped. */
export interface ModeloTenantConfig {
  /**
   * `true` si el modelo además de `organizacionId` lleva `grupoId` y debe
   * filtrarse por los `grupoIds` del tenant (cuando la lista no está vacía —
   * un ORG_ADMIN trae lista vacía = acceso a toda la organización, ADR-00 §3).
   */
  conGrupoId: boolean;
}

export interface OpcionesTenantExtension {
  /** Modelos tenant-scoped, indexados por el nombre EXACTO del modelo Prisma. */
  modelos: Record<string, ModeloTenantConfig>;
  /** Fuente del contexto; default: el AsyncLocalStorage de `TenantContextGuard`. */
  obtenerTenant?: () => TenantContext | undefined;
}

/**
 * Operaciones cuyo `where` admite condiciones no-únicas y por lo tanto se
 * pueden filtrar automáticamente. Las operaciones sobre índice único
 * (`findUnique`, `update`, `delete`, `upsert`) NO se interceptan: Prisma exige
 * ahí un `where` únicamente-único. Regla para los servicios: para
 * lecturas/escrituras tenant-scoped de una sola fila usar
 * `findFirst`/`updateMany`/`deleteMany`, que sí pasan por este filtro.
 */
const OPERACIONES_FILTRABLES = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

interface ParametrosOperacion {
  model?: string;
  operation: string;
  args: { where?: Record<string, unknown> } & Record<string, unknown>;
  query: (args: unknown) => Promise<unknown>;
}

/**
 * Reemplazo del `PrismaTenantMiddleware` de ADR-00 §2 en Prisma 7 (la API
 * `$use` fue eliminada; esto es una *client extension* con la misma semántica):
 * agrega automáticamente `where.organizacionId = tenant.organizacionId` (y
 * `grupoId IN tenant.grupoIds` cuando el modelo lo tiene) a las queries de los
 * modelos declarados, para evitar fugas entre tenants por olvido humano.
 *
 * Sin contexto de tenant (rutas públicas de auth, rutas `/internal/*`) las
 * queries pasan sin filtro — esas rutas trabajan con IDs explícitos y validan
 * acceso por otra vía (ADR-00 §4).
 *
 * Uso en el `PrismaService` de cada servicio:
 * `new PrismaClient({ adapter }).$extends(crearTenantExtension({ modelos: {...} }))`.
 */
export function crearTenantExtension(opciones: OpcionesTenantExtension) {
  const obtenerTenant = opciones.obtenerTenant ?? getTenantContext;

  return {
    name: 'dorado-tenant-scope',
    query: {
      $allModels: {
        $allOperations(params: ParametrosOperacion): Promise<unknown> {
          const { model, operation, args, query } = params;
          const config = model ? opciones.modelos[model] : undefined;
          const tenant = obtenerTenant();

          if (!config || !tenant || !OPERACIONES_FILTRABLES.has(operation)) {
            return query(args);
          }

          const filtro: Record<string, unknown> = {
            organizacionId: tenant.organizacionId,
          };

          if (config.conGrupoId && tenant.grupoIds.length > 0) {
            filtro['grupoId'] = { in: tenant.grupoIds };
          }

          const nuevosArgs = {
            ...args,
            where: args.where ? { AND: [args.where, filtro] } : filtro,
          };

          return query(nuevosArgs);
        },
      },
    },
  };
}
