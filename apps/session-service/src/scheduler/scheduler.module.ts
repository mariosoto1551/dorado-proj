import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { SeccionesModule } from '../secciones/secciones.module';
import { SchedulerService } from './scheduler.service';

/**
 * Modo AUTOMATICO (spec fase-06). `ScheduleModule.forRoot()` se registra en
 * AppModule; acá solo el job. Sin controller: el scheduler no expone HTTP.
 */
@Module({
  imports: [ClientesModule, SeccionesModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
