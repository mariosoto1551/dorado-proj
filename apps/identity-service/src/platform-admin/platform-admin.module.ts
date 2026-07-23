import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PlatformAdminBootstrapService } from './platform-admin-bootstrap.service';

/**
 * Panel de PLATFORM_ADMIN (fase-14-05): cuenta de plataforma, su auth propia
 * (prefijo `auth/admin`) y la gestión cross-tenant de organizaciones (prefijo
 * `admin`). `TokensService` viene de `AuthModule`; billing y eventos de sus
 * módulos (EventosModule y PrismaModule son @Global).
 */
@Module({
  imports: [AuthModule, BillingModule],
  controllers: [AdminAuthController, AdminController],
  providers: [AdminAuthService, AdminService, PlatformAdminBootstrapService],
})
export class PlatformAdminModule {}
