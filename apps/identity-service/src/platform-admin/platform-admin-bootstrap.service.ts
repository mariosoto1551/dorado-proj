import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import { PrismaService } from '../prisma/prisma.service';

const NOMBRE_POR_DEFECTO = 'Administrador de plataforma';

/**
 * Bootstrap de la cuenta PLATFORM_ADMIN (fase-14-05). No hay registro público
 * para este rol: la primera cuenta se crea desde variables de entorno.
 *
 * Idempotente: si el email ya existe, no-op (no re-hashea ni pisa el password).
 * Si las variables no están seteadas, no hace nada (entorno sin admin: tests,
 * CI). Nunca detiene el arranque del servicio por esto — solo loguea.
 */
@Injectable()
export class PlatformAdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(PlatformAdminBootstrapService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('PLATFORM_ADMIN_EMAIL');
    const password = this.config.get<string>('PLATFORM_ADMIN_PASSWORD');

    if (!email || !password) {
      return;
    }

    const existente = await this.prisma.client.platformAdmin.findUnique({
      where: { email },
    });

    if (existente) {
      this.logger.log(`PLATFORM_ADMIN '${email}' ya existe — no se recrea.`);
      return;
    }

    const nombre = this.config.get<string>('PLATFORM_ADMIN_NOMBRE') ?? NOMBRE_POR_DEFECTO;
    const passwordHash = await argon2.hash(password);

    await this.prisma.client.platformAdmin.create({
      data: { email, passwordHash, nombre },
    });

    this.logger.log(`PLATFORM_ADMIN '${email}' creado por bootstrap de entorno.`);
  }
}
