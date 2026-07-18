import { Module } from '@nestjs/common';

import { IdentityClientService } from './identity-client.service';
import { ScoringClientService } from './scoring-client.service';

/** Clientes REST internos (ADR-00 §4) compartidos por las features. */
@Module({
  providers: [IdentityClientService, ScoringClientService],
  exports: [IdentityClientService, ScoringClientService],
})
export class ClientesModule {}
