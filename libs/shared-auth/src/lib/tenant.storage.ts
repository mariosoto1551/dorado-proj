import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { TenantContext } from '@dorado/shared-types';

/**
 * Contexto de tenant por-request. Lo escribe `TenantContextGuard` después de
 * validar el JWT y lo lee `crearTenantExtension` (filtro automático de Prisma)
 * sin necesidad de inyectar el request en cada servicio.
 *
 * Patrón holder mutable (regresión detectada en Fase 5): el store se abre en
 * un middleware (`tenantScopeMiddleware`, registrado en `main.ts` con
 * `app.use`) y el guard MUTA el holder en vez de hacer `enterWith`. Un
 * `enterWith` dentro de un `canActivate` async se pierde cuando NestJS retoma
 * después de `await`-earlo (el store solo vive en el async resource del guard,
 * no en la continuación del llamador), con lo cual la extensión de Prisma veía
 * `undefined` y NO filtraba por organización. El holder compartido, creado
 * antes en la cadena, es visible para todo el árbol async del request.
 */
interface TenantHolder {
  tenant?: TenantContext;
}

export const tenantStorage = new AsyncLocalStorage<TenantHolder>();

/**
 * Middleware Express funcional. Se registra con `app.use(tenantScopeMiddleware)`
 * en el `main.ts` de cada servicio con datos de tenant (junto a
 * `correlationMiddleware`): abre el holder que `TenantContextGuard` completa.
 */
export function tenantScopeMiddleware(
  _req: IncomingMessage,
  _res: ServerResponse,
  next: () => void
): void {
  tenantStorage.run({}, next);
}

/** La llama `TenantContextGuard` con el JWT ya validado. */
export function setTenantContext(tenant: TenantContext): void {
  const holder = tenantStorage.getStore();

  if (holder) {
    holder.tenant = tenant;
    return;
  }

  // Sin middleware registrado (tests unitarios, flujos síncronos): fallback al
  // comportamiento anterior — válido solo dentro del mismo async resource.
  tenantStorage.enterWith({ tenant });
}

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore()?.tenant;
}
