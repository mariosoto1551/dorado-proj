import { Module } from '@nestjs/common';

import { InternalHealthController } from './internal-health.controller';

// La spec fase-08 no define endpoints internos de datos para rewards — solo
// el health que consume GET /api/health del Gateway.
@Module({
  controllers: [InternalHealthController],
})
export class InternalModule {}
