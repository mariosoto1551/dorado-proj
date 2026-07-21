import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { CierreConsumer } from './cierre.consumer';
import { CierreService } from './cierre.service';

/**
 * Consumo de eventos de activity-service (fase-14-08): castigo automático de
 * obligatorias confirmables no confirmadas al cerrar la Sesión. PrismaService y
 * EventosPublisherService vienen de sus módulos @Global; IdentityClientService
 * de ClientesModule.
 */
@Module({
  imports: [ClientesModule],
  providers: [CierreConsumer, CierreService],
})
export class ConsumoModule {}
