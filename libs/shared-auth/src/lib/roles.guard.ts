import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Rol } from '@dorado/shared-types';

import { ROLES_METADATA_KEY } from './roles.decorator';
import type { RequestConTenant } from './tenant-context.guard';

/**
 * Autorización por rol sobre la metadata de `@Roles(...)`. Sin metadata, deja
 * pasar (el endpoint solo exige autenticación). Requiere que
 * `TenantContextGuard` haya corrido antes en la cadena de guards.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesPermitidos = this.reflector.getAllAndOverride<Rol[] | undefined>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!rolesPermitidos || rolesPermitidos.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<RequestConTenant>();
    const tenant = req.tenant;

    if (!tenant) {
      throw new UnauthorizedException(
        'RolesGuard requiere TenantContextGuard antes en la cadena de guards'
      );
    }

    if (!rolesPermitidos.includes(tenant.rol)) {
      throw new ForbiddenException('Rol insuficiente para esta operación');
    }

    return true;
  }
}
