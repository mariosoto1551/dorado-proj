import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SharedLoggingModule } from '@dorado/shared-logging';

import { validarEnv } from '../config/env.schema';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [
    // validate: el Gateway NO arranca con env inválido (ADR-00 §8).
    // envFilePath relativo al cwd del workspace (nx serve corre desde la raíz).
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnv,
      envFilePath: ['apps/gateway/.env', '.env'],
    }),
    SharedLoggingModule.forService('gateway'),
    HealthModule,
  ],
})
export class AppModule {}
