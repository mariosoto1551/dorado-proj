import { Module } from '@nestjs/common';

import { ActivityClientService } from './activity-client.service';
import { IdentityClientService } from './identity-client.service';

/** Clientes REST internos (ADR-00 §4) para destinatarios y nombres. */
@Module({
  providers: [IdentityClientService, ActivityClientService],
  exports: [IdentityClientService, ActivityClientService],
})
export class ClientesModule {}
