import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ConfiguracionController } from './configuracion.controller';
import { ConfiguracionService } from './configuracion.service';

/**
 * Config de recompensas por Grupo (fase-14-22). Exporta el service porque lo
 * consumen los consumidores de eventos: `SeccionesConsumer` para aplicar el
 * modo pendiente, y el cierre económico para saber si el grupo usa tienda.
 */
@Module({
  imports: [ClientesModule],
  controllers: [ConfiguracionController],
  providers: [ConfiguracionService, AccesoGrupoService],
  exports: [ConfiguracionService],
})
export class ConfiguracionModule {}
