import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';

@Module({
  imports: [BillingModule],
  controllers: [AuthController],
  providers: [AuthService, TokensService],
  exports: [AuthService],
})
export class AuthModule {}
