import { Module } from '@nestjs/common';

import { AuditoriaConsumer } from './auditoria.consumer';

/** Consumo de eventos (spec fase-09): la única vía de escritura de audit. */
@Module({
  providers: [AuditoriaConsumer],
})
export class ConsumoModule {}
