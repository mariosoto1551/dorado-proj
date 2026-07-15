import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { jwtVerify } from 'jose';

import type { JwtPayload, TenantContext } from '@dorado/shared-types';

import { JWT_ALG, obtenerClavePublicaJwt } from './jwt-keys';
import { tenantStorage } from './tenant.storage';

/**
 * Forma mínima del request que usan los guards/decorators de esta lib
 * (evita acoplarse a los tipos de Express en una lib compartida).
 */
export interface RequestConTenant {
  headers: Record<string, string | string[] | undefined>;
  tenant?: TenantContext;
}

/**
 * Guard principal de autenticación multi-tenant (ADR-00 §2–3).
 *
 * Valida el JWT RS256 del header `Authorization: Bearer <token>` con la clave
 * pública (`JWT_PUBLIC_KEY`) y adjunta
 * `req.tenant = { organizacionId, grupoIds, rol, principalId, principalType }`.
 * También deja el contexto en `tenantStorage` para el filtro automático de
 * Prisma (`crearTenantExtension`).
 *
 * Semántica de `grupoIds` (ADR-00 §3 y fase-02): si `rol=ORG_ADMIN` la lista
 * viene vacía y significa "todos los grupos de organizacionId", no "ninguno".
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestConTenant>();
    const header = req.headers['authorization'];
    const valor = Array.isArray(header) ? header[0] : header;

    if (!valor || !valor.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token de acceso');
    }

    const token = valor.slice('Bearer '.length);
    let payload: JwtPayload;

    try {
      const clave = await obtenerClavePublicaJwt();
      const resultado = await jwtVerify(token, clave, { algorithms: [JWT_ALG] });
      payload = resultado.payload as unknown as JwtPayload;
    } catch {
      throw new UnauthorizedException('Token de acceso inválido o expirado');
    }

    const tenant: TenantContext = {
      organizacionId: payload.organizacionId,
      grupoIds: payload.grupoIds ?? [],
      rol: payload.rol,
      principalId: payload.sub,
      principalType: payload.principalType,
    };

    req.tenant = tenant;
    tenantStorage.enterWith(tenant);

    return true;
  }
}
