import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { crearTenantExtension } from '@dorado/shared-auth';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Modelos tenant-scoped de billing (ADR-00 §2). `Plan` y `EventoProcesado`
 * quedan fuera a propósito: son catálogo/registro de plataforma, no datos de
 * una organización. `Suscripcion` no tiene `grupoId` (es por organización).
 *
 * El consumer de eventos y las rutas /internal/* corren SIN contexto de
 * tenant (la extensión no filtra ahí) y trabajan con IDs explícitos — el
 * llamador interno es confiable (ADR-00 §4).
 */
const MODELOS_TENANT = {
  Suscripcion: { conGrupoId: false },
};

export function crearClientePrisma(databaseUrl: string) {
  // Prisma 7: driver adapter explícito, siempre (ver skill prisma-orm).
  const adapter = new PrismaPg({ connectionString: databaseUrl });

  return new PrismaClient({ adapter }).$extends(
    crearTenantExtension({ modelos: MODELOS_TENANT })
  );
}

export type ClientePrisma = ReturnType<typeof crearClientePrisma>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: ClientePrisma;

  constructor(config: ConfigService) {
    this.client = crearClientePrisma(config.getOrThrow<string>('DATABASE_URL'));
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
