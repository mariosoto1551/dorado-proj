import { Module } from '@nestjs/common';

import { IdentityClientService } from './identity-client.service';
import { SessionClientService } from './session-client.service';

/** Clientes REST internos (ADR-00 §4) compartidos por features y consumidores. */
@Module({
  providers: [IdentityClientService, SessionClientService],
  exports: [IdentityClientService, SessionClientService],
})
export class ClientesModule {}
