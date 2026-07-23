import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { jwtVerify } from 'jose';

import { JWT_ALG, obtenerClavePublicaJwt } from '@dorado/shared-auth';
import { type JwtPayload, Rol } from '@dorado/shared-types';

import { SoloPlatformAdminException } from '../comun/excepciones';

/** Request con la identidad del admin de plataforma ya validada. */
export interface RequestConAdmin {
  headers: Record<string, string | string[] | undefined>;
  platformAdminId?: string;
}

/**
 * Autoriza SOLO tokens con `rol = PLATFORM_ADMIN` (fase-14-05).
 *
 * A diferencia de `TenantContextGuard`, este guard NO escribe el contexto de
 * tenant (`setTenantContext`): un admin de plataforma es cross-tenant, y dejar
 * el contexto vacío hace que el filtro automático de Prisma NO recorte las
 * queries por `organizacionId` — justamente lo que necesita el panel para ver
 * todas las organizaciones. El `AdminService` filtra por org de forma explícita
 * cuando corresponde.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestConAdmin>();
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

    if (payload.rol !== Rol.PLATFORM_ADMIN) {
      throw new SoloPlatformAdminException();
    }

    req.platformAdminId = payload.sub;

    return true;
  }
}

/** Inyecta el id del admin de plataforma validado por `PlatformAdminGuard`. */
export const CurrentAdminId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const req = context.switchToHttp().getRequest<RequestConAdmin>();

    if (!req.platformAdminId) {
      throw new UnauthorizedException('PlatformAdminGuard no corrió antes en la cadena');
    }

    return req.platformAdminId;
  }
);
