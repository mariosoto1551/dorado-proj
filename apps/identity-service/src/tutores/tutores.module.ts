import { Module } from '@nestjs/common';

import { ComunModule } from '../comun/comun.module';
import { TutoresController } from './tutores.controller';
import { TutoresService } from './tutores.service';

@Module({
  imports: [ComunModule],
  controllers: [TutoresController],
  providers: [TutoresService],
})
export class TutoresModule {}
