import { AsyncLocalStorage } from 'node:async_hooks';

import type { TenantContext } from '@dorado/shared-types';

/**
 * Contexto de tenant por-request. Lo escribe `TenantContextGuard` después de
 * validar el JWT y lo lee `crearTenantExtension` (filtro automático de Prisma)
 * sin necesidad de inyectar el request en cada servicio.
 */
export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}
