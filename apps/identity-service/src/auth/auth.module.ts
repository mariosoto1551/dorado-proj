import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PlanResolverService } from './plan-resolver.service';
import { TokensService } from './tokens.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, TokensService, PlanResolverService],
  exports: [AuthService],
})
export class AuthModule {}
