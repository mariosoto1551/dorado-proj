import { Module } from '@nestjs/common';

import { InternalHealthController } from './internal-health.controller';

/**
 * Endpoints internos de ai-service.
 *
 * Por ahora **solo el health**: este servicio no expone datos a otros
 * servicios. La flecha va al revés — es él quien lee del resto, y siempre por
 * GET (fase-14-29 decisión 6, ver `ClienteInternoBase`).
 */
@Module({
  controllers: [InternalHealthController],
})
export class InternalModule {}
