import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import type { TutorDto } from '@dorado/shared-types';

import { AuthService } from './auth.service';
import {
  establecerCookieRefresh,
  leerCookieRefresh,
  limpiarCookieRefresh,
} from './cookies';
import { LoginRequest, LoginResponse } from './dto/login.dto';
import {
  RegistrarOrganizacionRequest,
  RegistrarOrganizacionResponse,
} from './dto/registrar-organizacion.dto';

// Endpoints públicos de autenticación (sin JWT) — tabla de la spec fase-02.
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService
  ) {}

  @Post('organizaciones')
  async registrarOrganizacion(
    @Body() datos: RegistrarOrganizacionRequest,
    @Res({ passthrough: true }) res: Response
  ): Promise<RegistrarOrganizacionResponse> {
    const { sesion, organizacion } = await this.authService.registrarOrganizacion(datos);

    establecerCookieRefresh(res, sesion.refresh, this.cookieSecure());

    return {
      accessToken: sesion.accessToken,
      tutor: sesion.perfil as TutorDto,
      organizacion,
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() datos: LoginRequest,
    @Res({ passthrough: true }) res: Response
  ): Promise<LoginResponse> {
    const sesion = await this.authService.login(datos);

    establecerCookieRefresh(res, sesion.refresh, this.cookieSecure());

    return {
      accessToken: sesion.accessToken,
      principalType: sesion.principalType,
      perfil: sesion.perfil,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refrescar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<LoginResponse> {
    const sesion = await this.authService.refrescar(leerCookieRefresh(req));

    establecerCookieRefresh(res, sesion.refresh, this.cookieSecure());

    return {
      accessToken: sesion.accessToken,
      principalType: sesion.principalType,
      perfil: sesion.perfil,
    };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<void> {
    await this.authService.logout(leerCookieRefresh(req));
    limpiarCookieRefresh(res);
  }

  private cookieSecure(): boolean {
    return this.config.get<string>('REFRESH_COOKIE_SECURE') === 'true';
  }
}
