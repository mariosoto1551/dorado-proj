import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SharedLoggingModule } from '@dorado/shared-logging';

import { ActividadesModule } from '../actividades/actividades.module';
import { ConductasModule } from '../conductas/conductas.module';
import { validarEnv } from '../config/env.schema';
import { InternalModule } from '../internal/internal.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    // validate: el servicio NO arranca con env inválido (ADR-00 §8).
    // envFilePath relativo al cwd del workspace (nx serve corre desde la raíz).
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnv,
      envFilePath: ['apps/activity-service/.env', '.env'],
    }),
    SharedLoggingModule.forService('activity-service'),
    PrismaModule,
    ActividadesModule,
    ConductasModule,
    InternalModule,
  ],
})
export class AppModule {}
