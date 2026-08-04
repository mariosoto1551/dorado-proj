import { Module } from '@nestjs/common';

import { ActivityClientService } from './activity-client.service';
import { IdentityClientService } from './identity-client.service';
import { ScoringClientService } from './scoring-client.service';

/** Clientes REST internos (ADR-00 §4) compartidos por las features. */
@Module({
  providers: [IdentityClientService, ScoringClientService, ActivityClientService],
  exports: [IdentityClientService, ScoringClientService, ActivityClientService],
})
export class ClientesModule {}
