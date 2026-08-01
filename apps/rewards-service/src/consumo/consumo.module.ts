import { Module } from '@nestjs/common';

import { CierreModule } from '../cierre/cierre.module';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { SeccionesConsumer } from './secciones.consumer';
import { ZonasConsumer } from './zonas.consumer';

/**
 * Consumo de eventos:
 * - `ZonaAlcanzada`: en DIRECTO no tiene efecto de negocio (fase-08); en
 *   TIENDA dispara el cierre económico (fase-14-22).
 * - `SeccionAbierta` (fase-14-22): aplica el cambio de modo diferido.
 */
@Module({
  imports: [ConfiguracionModule, CierreModule],
  providers: [ZonasConsumer, SeccionesConsumer],
})
export class ConsumoModule {}
