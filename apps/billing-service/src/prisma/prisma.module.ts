import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';
import { SeedPlanesService } from './seed-planes.service';

@Global()
@Module({
  providers: [PrismaService, SeedPlanesService],
  exports: [PrismaService],
})
export class PrismaModule {}
