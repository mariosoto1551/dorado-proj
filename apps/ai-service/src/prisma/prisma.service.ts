import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { crearTenantExtension } from '@dorado/shared-auth';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Modelos tenant-scoped de ai (ADR-00 §2). Con contexto de tenant, la
 * extensión filtra automáticamente por organizacionId y — cuando
 * tenant.grupoIds no está vacío (TUTOR) — por grupoId IN grupoIds. ORG_ADMIN
 * (lista vacía) ve todos los grupos de su organización.
 *
 * `Mensaje` NO va acá aunque lleve organizacionId: cuelga de una Conversacion
 * que sí está filtrada, no tiene grupoId, y el cálculo de cuota (decisión 8)
 * necesita agregarlo por organización **fuera** de un contexto de grupo. El
 * service manda siempre `organizacionId` explícito en el where, como hacen los
 * services de monedas de rewards — no confía en la extensión.
 *
 * `ConfiguracionIaOrganizacion` tampoco: su clave es organizacionId y se
 * accede con findUnique/upsert, que la extensión no puede interceptar (mismo
 * caso que `ConfiguracionRecompensasGrupo` de rewards, fase-14-22).
 */
const MODELOS_TENANT = {
  Conversacion: { conGrupoId: true },
  Propuesta: { conGrupoId: true },
};

export function crearClientePrisma(databaseUrl: string) {
  // Prisma 7: driver adapter explícito, siempre (ver skill prisma-orm).
  const adapter = new PrismaPg({ connectionString: databaseUrl });

  return new PrismaClient({ adapter }).$extends(crearTenantExtension({ modelos: MODELOS_TENANT }));
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
