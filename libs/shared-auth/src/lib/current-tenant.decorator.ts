import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { TenantContext } from '@dorado/shared-types';

import type { RequestConTenant } from './tenant-context.guard';

/**
 * Inyecta el `TenantContext` adjuntado por `TenantContextGuard`:
 *
 * ```ts
 * @Get()
 * listar(@CurrentTenant() tenant: TenantContext) { ... }
 * ```
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext | undefined => {
    const req = context.switchToHttp().getRequest<RequestConTenant>();
    return req.tenant;
  }
);
