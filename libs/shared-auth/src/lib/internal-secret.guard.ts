import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

import type { RequestConTenant } from './tenant-context.guard';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

/**
 * Protege las rutas `/internal/*` (ADR-00 §4): valida el header
 * `x-internal-secret` contra `GATEWAY_INTERNAL_SECRET`. Es deliberadamente un
 * guard SEPARADO de `TenantContextGuard` — las rutas internas no llevan JWT de
 * usuario y nunca se exponen vía Gateway público.
 */
@Injectable()
export class InternalSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const esperado = process.env['GATEWAY_INTERNAL_SECRET'];

    if (!esperado) {
      // El schema de env de cada servicio debería impedir llegar acá (ADR-00 §8).
      throw new InternalServerErrorException(
        'GATEWAY_INTERNAL_SECRET no está configurado en este servicio'
      );
    }

    const req = context.switchToHttp().getRequest<RequestConTenant>();
    const header = req.headers[INTERNAL_SECRET_HEADER];
    const recibido = Array.isArray(header) ? header[0] : header;

    if (!recibido || !this.sonIguales(recibido, esperado)) {
      throw new UnauthorizedException('x-internal-secret inválido o ausente');
    }

    return true;
  }

  private sonIguales(a: string, b: string): boolean {
    // Comparación en tiempo constante; se hashea para igualar longitudes.
    const hashA = createHash('sha256').update(a).digest();
    const hashB = createHash('sha256').update(b).digest();
    return timingSafeEqual(hashA, hashB);
  }
}
