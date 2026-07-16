import { Module } from '@nestjs/common';

import { InternalHealthController } from './internal-health.controller';

/**
 * Solo health en esta fase: activity no expone endpoints internos de datos
 * todavía (los de registro/consulta para Scoring llegan en Fase 7).
 */
@Module({
  controllers: [InternalHealthController],
})
export class InternalModule {}
