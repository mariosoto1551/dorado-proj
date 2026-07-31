import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SharedLoggingModule } from '@dorado/shared-logging';

import { AuthModule } from '../auth/auth.module';
import { validarEnv } from '../config/env.schema';
import { EquiposModule } from '../equipos/equipos.module';
import { EventosModule } from '../eventos/eventos.module';
import { GruposModule } from '../grupos/grupos.module';
import { InternalModule } from '../internal/internal.module';
import { InvitacionesModule } from '../invitaciones/invitaciones.module';
import { MeModule } from '../me/me.module';
import { PlatformAdminModule } from '../platform-admin/platform-admin.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesGrupoModule } from '../roles-grupo/roles-grupo.module';
import { TutoresModule } from '../tutores/tutores.module';
import { UsuariosModule } from '../usuarios/usuarios.module';

@Module({
  imports: [
    // validate: el servicio NO arranca con env inválido (ADR-00 §8).
    // envFilePath relativo al cwd del workspace (nx serve corre desde la raíz).
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnv,
      envFilePath: ['apps/identity-service/.env', '.env'],
    }),
    SharedLoggingModule.forService('identity-service'),
    PrismaModule,
    EventosModule,
    AuthModule,
    InvitacionesModule,
    GruposModule,
    EquiposModule,
    RolesGrupoModule,
    UsuariosModule,
    TutoresModule,
    MeModule,
    InternalModule,
    PlatformAdminModule,
  ],
})
export class AppModule {}
