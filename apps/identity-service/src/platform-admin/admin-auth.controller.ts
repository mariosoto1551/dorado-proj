import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import type { AdminLoginResponse } from '@dorado/shared-types';

import {
  establecerCookieRefresh,
  leerCookieRefresh,
  limpiarCookieRefresh,
} from '../auth/cookies';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginRequest } from './dto/admin.dto';
import { PlatformAdminGuard } from './platform-admin.guard';

/**
 * Auth del panel de plataforma (fase-14-05). `login`/`refresh` son públicos
 * (sin bearer; el refresh usa la cookie httpOnly), igual que sus equivalentes
 * tenant. `logout` exige el JWT del admin.
 */
@Controller('auth/admin')
export class AdminAuthController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly config: ConfigService
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() datos: AdminLoginRequest,
    @Res({ passthrough: true }) res: Response
  ): Promise<AdminLoginResponse> {
    const sesion = await this.adminAuth.login(datos);

    establecerCookieRefresh(res, sesion.refresh, this.cookieSecure());

    return { accessToken: sesion.accessToken, perfil: sesion.perfil };
  }

  @Post('refresh')
  @HttpCode(200)
  async refrescar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<AdminLoginResponse> {
    const sesion = await this.adminAuth.refrescar(leerCookieRefresh(req));

    establecerCookieRefresh(res, sesion.refresh, this.cookieSecure());

    return { accessToken: sesion.accessToken, perfil: sesion.perfil };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(PlatformAdminGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<void> {
    await this.adminAuth.logout(leerCookieRefresh(req));
    limpiarCookieRefresh(res);
  }

  private cookieSecure(): boolean {
    return this.config.get<string>('REFRESH_COOKIE_SECURE') === 'true';
  }
}
