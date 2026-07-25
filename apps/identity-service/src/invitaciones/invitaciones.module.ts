import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ComunModule } from '../comun/comun.module';
import { InvitacionesAceptarController } from './invitaciones-aceptar.controller';
import { InvitacionesAdminController } from './invitaciones-admin.controller';
import { InvitacionesPublicController } from './invitaciones-public.controller';
import { InvitacionesService } from './invitaciones.service';

@Module({
  imports: [AuthModule, BillingModule, ComunModule],
  controllers: [
    InvitacionesPublicController,
    InvitacionesAdminController,
    InvitacionesAceptarController,
  ],
  providers: [InvitacionesService],
})
export class InvitacionesModule {}
