import { Module } from '@nestjs/common';

import { EtiquetasModule } from '../etiquetas/etiquetas.module';
import { InternalHealthController } from './internal-health.controller';
import { InternalController } from './internal.controller';

// La spec fase-08 no definía endpoints internos de datos para rewards — solo el
// health que consume GET /api/health del Gateway. Los dos GET de catálogo los
// agrega fase-14-29 para las herramientas de lectura del asistente.
@Module({
  imports: [EtiquetasModule],
  controllers: [InternalHealthController, InternalController],
})
export class InternalModule {}
