import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { ContextoParticipanteService } from '../comun/contexto-participante.service';
import { TurnosModule } from '../turnos/turnos.module';
import { CierreConsumer } from './cierre.consumer';
import { CierreService } from './cierre.service';

/**
 * Consumo de eventos de sesión de activity-service. Dos efectos sobre la misma
 * cola: el castigo automático al CERRAR (fase-14-08) y el sellado del turno del
 * día al ABRIR (fase-14-21). PrismaService y EventosPublisherService vienen de
 * sus módulos @Global; IdentityClientService de ClientesModule.
 */
@Module({
  imports: [ClientesModule, TurnosModule],
  providers: [CierreConsumer, CierreService, ContextoParticipanteService],
})
export class ConsumoModule {}
