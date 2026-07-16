import { Module } from '@nestjs/common';

import { SuscripcionesConsumer } from './suscripciones.consumer';
import { SuscripcionesController } from './suscripciones.controller';
import { SuscripcionesService } from './suscripciones.service';

@Module({
  controllers: [SuscripcionesController],
  providers: [SuscripcionesService, SuscripcionesConsumer],
  exports: [SuscripcionesService],
})
export class SuscripcionesModule {}
