import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { SharedLoggingModule } from '@dorado/shared-logging';

import { ClientesModule } from '../clientes/clientes.module';
import { validarEnv } from '../config/env.schema';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { EventosModule } from '../eventos/eventos.module';
import { InternalModule } from '../internal/internal.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SeccionesModule } from '../secciones/secciones.module';

@Module({
  imports: [
    // validate: el servicio NO arranca con env inválido (ADR-00 §8).
    // envFilePath relativo al cwd del workspace (nx serve corre desde la raíz).
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnv,
      envFilePath: ['apps/session-service/.env', '.env'],
    }),
    SharedLoggingModule.forService('session-service'),
    ScheduleModule.forRoot(),
    PrismaModule,
    EventosModule,
    ClientesModule,
    ConfiguracionModule,
    SeccionesModule,
    SchedulerModule,
    InternalModule,
  ],
})
export class AppModule {}
