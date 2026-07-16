import { Module } from '@nestjs/common';

import { BillingClientService } from './billing-client.service';

@Module({
  providers: [BillingClientService],
  exports: [BillingClientService],
})
export class BillingModule {}
