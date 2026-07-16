import { Module } from '@nestjs/common';

import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { InternalHealthController } from './internal-health.controller';
import { InternalController } from './internal.controller';

@Module({
  imports: [SuscripcionesModule],
  controllers: [InternalController, InternalHealthController],
})
export class InternalModule {}
