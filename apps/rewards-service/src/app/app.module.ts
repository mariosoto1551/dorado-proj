import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SharedLoggingModule } from '@dorado/shared-logging';

import { CanjesModule } from '../canjes/canjes.module';
import { ClientesModule } from '../clientes/clientes.module';
import { validarEnv } from '../config/env.schema';
import { ConsumoModule } from '../consumo/consumo.module';
import { EventosModule } from '../eventos/eventos.module';
import { InternalModule } from '../internal/internal.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RecompensasModule } from '../recompensas/recompensas.module';

@Module({
  imports: [
    // validate: el servicio NO arranca con env inválido (ADR-00 §8).
    // envFilePath relativo al cwd del workspace (nx serve corre desde la raíz).
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnv,
      envFilePath: ['apps/rewards-service/.env', '.env'],
    }),
    SharedLoggingModule.forService('rewards-service'),
    PrismaModule,
    EventosModule,
    ClientesModule,
    ConsumoModule,
    RecompensasModule,
    CanjesModule,
    InternalModule,
  ],
})
export class AppModule {}
