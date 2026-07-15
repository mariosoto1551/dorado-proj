import { SetMetadata } from '@nestjs/common';

import type { Rol } from '@dorado/shared-types';

export const ROLES_METADATA_KEY = 'dorado:roles';

/**
 * Restringe un handler/controller a los roles indicados. Se evalúa en
 * `RolesGuard`, que debe registrarse DESPUÉS de `TenantContextGuard`
 * (necesita `req.tenant` ya poblado):
 *
 * ```ts
 * @UseGuards(TenantContextGuard, RolesGuard)
 * @Roles(Rol.TUTOR, Rol.ORG_ADMIN)
 * ```
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_METADATA_KEY, roles);
