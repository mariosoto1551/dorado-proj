import { Module } from '@nestjs/common';

import { ZonasConsumer } from './zonas.consumer';

/** Consumo de eventos (spec fase-08): solo ZonaAlcanzada, sin efecto de negocio. */
@Module({
  providers: [ZonasConsumer],
})
export class ConsumoModule {}
