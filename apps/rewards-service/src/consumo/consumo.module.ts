import { Module } from '@nestjs/common';

import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { SeccionesConsumer } from './secciones.consumer';
import { ZonasConsumer } from './zonas.consumer';

/**
 * Consumo de eventos:
 * - `ZonaAlcanzada` (fase-08): sin efecto de negocio todavía.
 * - `SeccionAbierta` (fase-14-22): aplica el cambio de modo diferido.
 */
@Module({
  imports: [ConfiguracionModule],
  providers: [ZonasConsumer, SeccionesConsumer],
})
export class ConsumoModule {}
