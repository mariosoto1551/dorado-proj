import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { crearTenantExtension } from '@dorado/shared-auth';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Modelos tenant-scoped de scoring (ADR-00 §2): los cuatro llevan
 * organizacionId y grupoId. Con contexto de tenant, la extensión filtra
 * automáticamente por organizacionId y — cuando tenant.grupoIds no está vacío
 * (TUTOR/USUARIO) — por grupoId IN grupoIds. ORG_ADMIN (lista vacía) ve todos
 * los grupos de su organización. `EventoProcesado` NO va acá: es operacional
 * de los consumidores RabbitMQ, que corren sin contexto de tenant (por eso
 * los consumidores filtran SIEMPRE por organizacionId/grupoId explícitos del
 * envelope, igual que el scheduler de session).
 */
const MODELOS_TENANT = {
  EventoPuntos: { conGrupoId: true },
  UmbralZona: { conGrupoId: true },
  DescalificacionSeccion: { conGrupoId: true },
  ResultadoSeccion: { conGrupoId: true },
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
