import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { EvaluacionService } from './evaluacion.service';
import { ProyeccionService } from './proyeccion.service';
import { ScoringConsumer } from './scoring.consumer';

/**
 * Consumo de eventos (spec fase-07): proyección de registros al ledger y
 * evaluaciones de zona. `EvaluacionService` se exporta porque el cálculo en
 * vivo de los endpoints de puntaje es EXACTAMENTE la misma derivación del
 * ledger (una sola implementación de la regla 4.7).
 */
@Module({
  imports: [ClientesModule],
  providers: [ScoringConsumer, ProyeccionService, EvaluacionService],
  exports: [EvaluacionService],
})
export class ConsumoModule {}
