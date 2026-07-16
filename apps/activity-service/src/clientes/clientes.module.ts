import { Module } from '@nestjs/common';

import { BillingClientService } from './billing-client.service';
import { IdentityClientService } from './identity-client.service';

/** Clientes REST internos (ADR-00 §4) compartidos por actividades y conductas. */
@Module({
  providers: [BillingClientService, IdentityClientService],
  exports: [BillingClientService, IdentityClientService],
})
export class ClientesModule {}
