import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SharedLoggingModule } from '@dorado/shared-logging';

import { ClientesModule } from '../clientes/clientes.module';
import { validarEnv } from '../config/env.schema';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * ai-service (fase-14-29). Sin `EventosModule`: este servicio no publica ni
 * consume RabbitMQ (decisión 15). Lo que quede en el ledger de auditoría lo
 * escriben los servicios destino cuando el frontend aplica una propuesta,
 * exactamente como cuando el Tutor usa el formulario a mano.
 */
@Module({
  imports: [
    // validate: el servicio NO arranca con env inválido (ADR-00 §8).
    // envFilePath relativo al cwd del workspace (nx serve corre desde la raíz).
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnv,
      envFilePath: ['apps/ai-service/.env', '.env'],
    }),
    SharedLoggingModule.forService('ai-service'),
    PrismaModule,
    ClientesModule,
    ConfiguracionModule,
  ],
})
export class AppModule {}
