import { Module } from '@nestjs/common';

import { InternalHealthController } from './internal-health.controller';
import { InternalController } from './internal.controller';

@Module({
  controllers: [InternalController, InternalHealthController],
})
export class InternalModule {}
