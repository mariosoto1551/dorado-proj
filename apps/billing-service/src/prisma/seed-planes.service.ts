import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { PrismaService } from './prisma.service';
import { seedPlanes } from './seed-planes';

/**
 * Aplica el seed de Planes al levantar el servicio (spec fase-04: "corre al
 * levantar el servicio la primera vez"). Es un upsert idempotente: la primera
 * vez crea FREE/PRO; los arranques siguientes solo re-sincronizan el catálogo
 * con `PLANES_SEED` sin tocar las suscripciones existentes.
 */
@Injectable()
export class SeedPlanesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedPlanesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await seedPlanes(this.prisma.client);
    this.logger.log('Seed de Planes verificado (FREE/PRO presentes)');
  }
}
