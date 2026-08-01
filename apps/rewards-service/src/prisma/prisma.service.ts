import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { crearTenantExtension } from '@dorado/shared-auth';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Modelos tenant-scoped de rewards (ADR-00 §2): todos llevan organizacionId y
 * grupoId. Con contexto de tenant, la extensión filtra automáticamente por
 * organizacionId y — cuando tenant.grupoIds no está vacío (TUTOR/USUARIO) —
 * por grupoId IN grupoIds. ORG_ADMIN (lista vacía) ve todos los grupos de su
 * organización. `EventoProcesado` NO va acá: es operacional del consumidor
 * RabbitMQ, que corre sin contexto de tenant. `ConfiguracionRecompensasGrupo`
 * tampoco (fase-14-22): su clave es grupoId y se accede con findUnique/upsert,
 * que la extensión no puede interceptar — el acceso lo valida
 * `AccesoGrupoService`, mismo criterio que `ConfiguracionScoringGrupo`.
 */
const MODELOS_TENANT = {
  Recompensa: { conGrupoId: true },
  CanjeRecompensa: { conGrupoId: true },
  // fase-14-22: el ledger de monedas se filtra igual que el resto. `aggregate`
  // y `groupBy` están entre las operaciones filtrables, así que el saldo
  // derivado en un request nunca cruza organizaciones. Los consumidores corren
  // sin contexto y pasan sin filtro — por eso los services de monedas mandan
  // SIEMPRE grupoId y usuarioId explícitos en el where, no confían en esto.
  EventoMoneda: { conGrupoId: true },
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
