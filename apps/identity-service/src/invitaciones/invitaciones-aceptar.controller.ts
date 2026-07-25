import { Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { CurrentTenant, TenantContextGuard } from '@dorado/shared-auth';
import { TenantContext } from '@dorado/shared-types';

import { establecerCookieRefresh } from '../auth/cookies';
import type { LoginResponse } from '../auth/dto/login.dto';
import { InvitacionesService } from './invitaciones.service';

/**
 * Aceptar una invitación CON LA CUENTA YA AUTENTICADA (fase-14): cualquier
 * principal logueado —TUTOR o USUARIO— se une al grupo sin crear cuenta ni
 * reingresar datos. Solo `TenantContextGuard` (sin RolesGuard): el tipo de
 * cuenta requerido lo valida el servicio contra el tipo de la invitación.
 */
@Controller('identity/invitaciones')
@UseGuards(TenantContextGuard)
export class InvitacionesAceptarController {
  constructor(
    private readonly invitaciones: InvitacionesService,
    private readonly config: ConfigService
  ) {}

  @Post(':codigo/aceptar')
  async aceptar(
    @CurrentTenant() tenant: TenantContext,
    @Param('codigo') codigo: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<LoginResponse> {
    const sesion = await this.invitaciones.aceptar(tenant, codigo);

    establecerCookieRefresh(
      res,
      sesion.refresh,
      this.config.get<string>('REFRESH_COOKIE_SECURE') === 'true'
    );

    // Misma forma que login/canje: el JWT nuevo ya trae el grupo recién sumado.
    return {
      accessToken: sesion.accessToken,
      principalType: sesion.principalType,
      perfil: sesion.perfil,
    };
  }
}
