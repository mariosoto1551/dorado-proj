import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { establecerCookieRefresh } from '../auth/cookies';
import type { LoginResponse } from '../auth/dto/login.dto';
import {
  CanjearInvitacionRequest,
  PreviewInvitacionResponse,
} from './dto/invitaciones.dto';
import { InvitacionesService } from './invitaciones.service';

// Endpoints públicos de invitaciones (sin JWT): preview y canje (spec fase-02).
@Controller('auth/invitaciones')
export class InvitacionesPublicController {
  constructor(
    private readonly invitaciones: InvitacionesService,
    private readonly config: ConfigService
  ) {}

  @Get(':codigo')
  async preview(@Param('codigo') codigo: string): Promise<PreviewInvitacionResponse> {
    return await this.invitaciones.preview(codigo);
  }

  @Post(':codigo/canjear')
  async canjear(
    @Param('codigo') codigo: string,
    @Body() datos: CanjearInvitacionRequest,
    @Res({ passthrough: true }) res: Response
  ): Promise<LoginResponse> {
    const sesion = await this.invitaciones.canjear(codigo, datos);

    establecerCookieRefresh(
      res,
      sesion.refresh,
      this.config.get<string>('REFRESH_COOKIE_SECURE') === 'true'
    );

    // "Devuelve igual que login" (spec).
    return {
      accessToken: sesion.accessToken,
      principalType: sesion.principalType,
      perfil: sesion.perfil,
    };
  }
}
