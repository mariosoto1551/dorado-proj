import { Module } from '@nestjs/common';

import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { SeccionesModule } from '../secciones/secciones.module';
import { InternalHealthController } from './internal-health.controller';
import { InternalController } from './internal.controller';

@Module({
  imports: [ConfiguracionModule, SeccionesModule],
  controllers: [InternalHealthController, InternalController],
})
export class InternalModule {}
