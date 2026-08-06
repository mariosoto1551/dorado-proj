import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SharedLoggingModule } from '@dorado/shared-logging';

import { AjustesModule } from '../ajustes/ajustes.module';
import { ClientesModule } from '../clientes/clientes.module';
import { validarEnv } from '../config/env.schema';
import { ConsumoModule } from '../consumo/consumo.module';
import { CorreccionesModule } from '../correcciones/correcciones.module';
import { DescalificacionesModule } from '../descalificaciones/descalificaciones.module';
import { EventosModule } from '../eventos/eventos.module';
import { InternalModule } from '../internal/internal.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PuntajesModule } from '../puntajes/puntajes.module';
import { UmbralesModule } from '../umbrales/umbrales.module';

@Module({
  imports: [
    // validate: el servicio NO arranca con env inválido (ADR-00 §8).
    // envFilePath relativo al cwd del workspace (nx serve corre desde la raíz).
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnv,
      envFilePath: ['apps/scoring-service/.env', '.env'],
    }),
    SharedLoggingModule.forService('scoring-service'),
    PrismaModule,
    EventosModule,
    ClientesModule,
    ConsumoModule,
    PuntajesModule,
    UmbralesModule,
    DescalificacionesModule,
    CorreccionesModule,
    AjustesModule,
    InternalModule,
  ],
})
export class AppModule {}
