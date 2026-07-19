import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { NotificacionesConsumer } from './notificaciones.consumer';
import { PlantillasService } from './plantillas.service';

/** Consumo de los 9 eventos notificables (tabla de la spec fase-09). */
@Module({
  imports: [ClientesModule],
  providers: [NotificacionesConsumer, PlantillasService],
})
export class ConsumoModule {}
