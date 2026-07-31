import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { crearTenantExtension } from '@dorado/shared-auth';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Modelos tenant-scoped de activity (ADR-00 §2): todos llevan organizacionId
 * y grupoId. Con contexto de tenant, la extensión filtra automáticamente por
 * organizacionId y — cuando tenant.grupoIds no está vacío (TUTOR/USUARIO) —
 * por grupoId IN grupoIds. ORG_ADMIN (lista vacía) ve todos los grupos de su
 * organización. `CronometroActivo` NO va acá: el modelo de la spec fase-07 no
 * tiene organizacionId (operacional) — siempre se consulta con la clave
 * completa usuario+actividad+sesión ya validada contra el tenant.
 */
const MODELOS_TENANT = {
  Actividad: { conGrupoId: true },
  Conducta: { conGrupoId: true },
  RegistroActividad: { conGrupoId: true },
  RegistroConducta: { conGrupoId: true },
  // fase-14-17: es estado operativo, pero a diferencia de CronometroActivo sí
  // lleva organizacionId + grupoId, así que se declara y las lecturas por
  // usuario+sesión quedan filtradas de arriba (el upsert no se intercepta —
  // usa clave única —, y ahí el grupo ya viene de la Actividad tenant-filtrada).
  SeleccionPlanDia: { conGrupoId: true },
  // fase-14-18: las notas internas del tutor. Lleva organizacionId + grupoId y
  // solo la leen/escriben tutores, así que el filtro automático alcanza para el
  // aislamiento; el endpoint valida además que el registro anotado sea del
  // tenant y de la Sesión vigente.
  NotaRegistro: { conGrupoId: true },
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
