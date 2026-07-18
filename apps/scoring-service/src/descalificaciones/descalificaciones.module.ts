import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { DescalificacionesController } from './descalificaciones.controller';
import { DescalificacionesService } from './descalificaciones.service';

@Module({
  imports: [ClientesModule],
  controllers: [DescalificacionesController],
  providers: [DescalificacionesService],
})
export class DescalificacionesModule {}
