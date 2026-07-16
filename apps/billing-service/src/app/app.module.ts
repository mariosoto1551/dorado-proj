import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SharedLoggingModule } from '@dorado/shared-logging';

import { validarEnv } from '../config/env.schema';
import { EventosModule } from '../eventos/eventos.module';
import { InternalModule } from '../internal/internal.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';

@Module({
  imports: [
    // validate: el servicio NO arranca con env inválido (ADR-00 §8).
    // envFilePath relativo al cwd del workspace (nx serve corre desde la raíz).
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnv,
      envFilePath: ['apps/billing-service/.env', '.env'],
    }),
    SharedLoggingModule.forService('billing-service'),
    PrismaModule,
    EventosModule,
    SuscripcionesModule,
    InternalModule,
  ],
})
export class AppModule {}
