import { Module } from '@nestjs/common';

import { ComunModule } from '../comun/comun.module';
import { EquiposController } from './equipos.controller';
import { EquiposService } from './equipos.service';
import { MisEquiposController } from './mis-equipos.controller';

@Module({
  imports: [ComunModule],
  controllers: [EquiposController, MisEquiposController],
  providers: [EquiposService],
})
export class EquiposModule {}
