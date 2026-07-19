import { Module } from '@nestjs/common';

import { InternalHealthController } from './internal-health.controller';

// La spec fase-09 no define endpoints internos de datos para audit — solo el
// health que consume GET /api/health del Gateway.
@Module({
  controllers: [InternalHealthController],
})
export class InternalModule {}
