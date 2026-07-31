import { Module } from '@nestjs/common';

import { ComunModule } from '../comun/comun.module';
import { RolesGrupoController } from './roles-grupo.controller';
import { RolesGrupoService } from './roles-grupo.service';

@Module({
  imports: [ComunModule],
  controllers: [RolesGrupoController],
  providers: [RolesGrupoService],
})
export class RolesGrupoModule {}
