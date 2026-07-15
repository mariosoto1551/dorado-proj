import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { crearTenantExtension } from '@dorado/shared-auth';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Modelos tenant-scoped de identity: la extensión agrega automáticamente el
 * filtro `organizacionId` del tenant a sus queries (ADR-00 §2).
 *
 * `conGrupoId: false` es deliberado incluso en los modelos que tienen
 * `grupoId`: en ESTE servicio la visibilidad por grupo es lógica de
 * autorización cuya fuente de verdad es la tabla `TutorGrupo` (no el snapshot
 * `grupoIds` del JWT, que queda viejo si un tutor creó un grupo después del
 * login) y se resuelve explícitamente en `AccesoGrupoService`. Los demás
 * servicios (Fases 5+), que no tienen la tabla, sí filtrarán por el JWT.
 * Decisión documentada en docs/progreso/fase-02-identity.md.
 */
const MODELOS_TENANT = {
  Grupo: { conGrupoId: false },
  Tutor: { conGrupoId: false },
  Usuario: { conGrupoId: false },
  Invitacion: { conGrupoId: false },
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
