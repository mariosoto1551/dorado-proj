import { Module } from '@nestjs/common';

import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { HerramientasModule } from '../herramientas/herramientas.module';
import { ProveedorModule } from '../proveedor/proveedor.module';
import { ConversacionesController } from './conversaciones.controller';
import { ConversacionesService } from './conversaciones.service';
import { LoopService } from './loop.service';

/**
 * Conversaciones del asistente (fase-14-29 tanda 4).
 *
 * Importa `ConfiguracionModule` porque el gate de uso —plan, switch y cuota—
 * lo resuelve el mismo service que atiende la pantalla de configuración: si el
 * cálculo del consumo viviera en dos lados, tarde o temprano uno de los dos
 * cortaría distinto que el otro.
 */
@Module({
  imports: [ConfiguracionModule, HerramientasModule, ProveedorModule],
  controllers: [ConversacionesController],
  providers: [ConversacionesService, LoopService],
})
export class ConversacionesModule {}
