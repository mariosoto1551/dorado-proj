import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ComunModule } from '../comun/comun.module';
import { InvitacionesAdminController } from './invitaciones-admin.controller';
import { InvitacionesPublicController } from './invitaciones-public.controller';
import { InvitacionesService } from './invitaciones.service';

@Module({
  imports: [AuthModule, ComunModule],
  controllers: [InvitacionesPublicController, InvitacionesAdminController],
  providers: [InvitacionesService],
})
export class InvitacionesModule {}
