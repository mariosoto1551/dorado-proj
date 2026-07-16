import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { ComunModule } from '../comun/comun.module';
import { GruposController } from './grupos.controller';
import { GruposService } from './grupos.service';

@Module({
  imports: [BillingModule, ComunModule],
  controllers: [GruposController],
  providers: [GruposService],
})
export class GruposModule {}
