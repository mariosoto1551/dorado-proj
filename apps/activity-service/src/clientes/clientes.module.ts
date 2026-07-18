import { Module } from '@nestjs/common';

import { BillingClientService } from './billing-client.service';
import { IdentityClientService } from './identity-client.service';
import { SessionClientService } from './session-client.service';

/** Clientes REST internos (ADR-00 §4) compartidos por las features. */
@Module({
  providers: [BillingClientService, IdentityClientService, SessionClientService],
  exports: [BillingClientService, IdentityClientService, SessionClientService],
})
export class ClientesModule {}
