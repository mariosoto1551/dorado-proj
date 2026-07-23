import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

import { CodigoPlan, PlatformAdminDto, PrincipalType, Rol } from '@dorado/shared-types';

import {
  CredencialesInvalidasException,
  RefreshTokenInvalidoException,
} from '../comun/excepciones';
import { platformAdminADto } from '../comun/mapeadores';
import { EstadoCuenta } from '../generated/prisma/enums';
import type { PlatformAdmin } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshEmitido, TokensService } from '../auth/tokens.service';
import type { AdminLoginRequest } from './dto/admin.dto';

export interface SesionAdminEmitida {
  accessToken: string;
  refresh: RefreshEmitido;
  perfil: PlatformAdminDto;
}

/**
 * Autenticación del PLATFORM_ADMIN (fase-14-05). Separada de `AuthService`
 * (tenant) a propósito: espacio de identificadores distinto (tabla propia) y
 * un JWT que NO lleva `organizacionId`/`grupoIds` reales.
 */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService
  ) {}

  async login(datos: AdminLoginRequest): Promise<SesionAdminEmitida> {
    const admin = await this.prisma.client.platformAdmin.findUnique({
      where: { email: datos.email },
    });

    if (!admin) {
      throw new CredencialesInvalidasException();
    }

    const passwordCorrecto = await argon2.verify(admin.passwordHash, datos.password);

    // Mensaje único para password incorrecto y cuenta INACTIVA (no dar pistas).
    if (!passwordCorrecto || admin.estado !== EstadoCuenta.ACTIVO) {
      throw new CredencialesInvalidasException();
    }

    return await this.emitirSesion(admin);
  }

  async refrescar(tokenActual: string | undefined): Promise<SesionAdminEmitida> {
    if (!tokenActual) {
      throw new RefreshTokenInvalidoException();
    }

    const consumido = await this.tokens.consumirRefreshToken(tokenActual);

    if (!consumido || consumido.principalType !== PrincipalType.PLATFORM_ADMIN) {
      throw new RefreshTokenInvalidoException();
    }

    const admin = await this.prisma.client.platformAdmin.findUnique({
      where: { id: consumido.principalId },
    });

    if (!admin || admin.estado !== EstadoCuenta.ACTIVO) {
      throw new RefreshTokenInvalidoException();
    }

    return await this.emitirSesion(admin);
  }

  async logout(tokenActual: string | undefined): Promise<void> {
    if (tokenActual) {
      await this.tokens.revocarRefreshToken(tokenActual);
    }
  }

  private async emitirSesion(admin: PlatformAdmin): Promise<SesionAdminEmitida> {
    const accessToken = await this.tokens.emitirAccessToken({
      principalId: admin.id,
      principalType: PrincipalType.PLATFORM_ADMIN,
      // Un admin de plataforma no pertenece a ninguna organización (fase-14-05).
      organizacionId: '',
      grupoIds: [],
      rol: Rol.PLATFORM_ADMIN,
      // `plan` no aplica; valor de relleno, nunca se lee para un admin.
      plan: CodigoPlan.FREE,
    });

    const refresh = await this.tokens.emitirRefreshToken(PrincipalType.PLATFORM_ADMIN, admin.id);

    return { accessToken, refresh, perfil: platformAdminADto(admin) };
  }
}
