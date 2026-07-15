import { Module } from '@nestjs/common';

import { ComunModule } from '../comun/comun.module';
import { GruposController } from './grupos.controller';
import { GruposService } from './grupos.service';

@Module({
  imports: [ComunModule],
  controllers: [GruposController],
  providers: [GruposService],
})
export class GruposModule {}
