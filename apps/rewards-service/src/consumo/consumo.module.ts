import { Module } from '@nestjs/common';

import { AccionesModule } from '../acciones/acciones.module';
import { CierreModule } from '../cierre/cierre.module';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { AccionesConsumer } from './acciones.consumer';
import { SeccionesConsumer } from './secciones.consumer';
import { ZonasConsumer } from './zonas.consumer';

/**
 * Consumo de eventos:
 * - `ZonaAlcanzada`: en DIRECTO no tiene efecto de negocio (fase-08); en
 *   TIENDA dispara el cierre económico (fase-14-22).
 * - `SeccionAbierta` (fase-14-22): aplica el cambio de modo diferido.
 * - las OCHO de activity (fase-14-28): la segunda fuente de la economía —
 *   cuatro que pagan y cuatro que corrigen. En DIRECTO no escriben nada.
 */
@Module({
  imports: [ConfiguracionModule, CierreModule, AccionesModule],
  providers: [ZonasConsumer, SeccionesConsumer, AccionesConsumer],
})
export class ConsumoModule {}
