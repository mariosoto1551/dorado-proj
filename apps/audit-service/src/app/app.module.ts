import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SharedLoggingModule } from '@dorado/shared-logging';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { validarEnv } from '../config/env.schema';
import { ConsumoModule } from '../consumo/consumo.module';
import { EventosModule } from '../eventos/eventos.module';
import { InternalModule } from '../internal/internal.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    // validate: el servicio NO arranca con env inválido (ADR-00 §8).
    // envFilePath relativo al cwd del workspace (nx serve corre desde la raíz).
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnv,
      envFilePath: ['apps/audit-service/.env', '.env'],
    }),
    SharedLoggingModule.forService('audit-service'),
    PrismaModule,
    EventosModule,
    ConsumoModule,
    AuditoriaModule,
    InternalModule,
  ],
})
export class AppModule {}
