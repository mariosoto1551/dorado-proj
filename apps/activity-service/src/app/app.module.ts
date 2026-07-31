import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SharedLoggingModule } from '@dorado/shared-logging';

import { ActividadesModule } from '../actividades/actividades.module';
import { ConductasModule } from '../conductas/conductas.module';
import { validarEnv } from '../config/env.schema';
import { ConsumoModule } from '../consumo/consumo.module';
import { ContenidoUsuarioModule } from '../contenido-usuario/contenido-usuario.module';
import { EquiposModule } from '../equipos/equipos.module';
import { EventosModule } from '../eventos/eventos.module';
import { HistorialModule } from '../historial/historial.module';
import { InternalModule } from '../internal/internal.module';
import { PlanDiaModule } from '../plan-dia/plan-dia.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RegistroModule } from '../registro/registro.module';

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
    EventosModule,
    ActividadesModule,
    ConductasModule,
    RegistroModule,
    HistorialModule,
    EquiposModule,
    ContenidoUsuarioModule,
    PlanDiaModule,
    ConsumoModule,
    InternalModule,
  ],
})
export class AppModule {}
