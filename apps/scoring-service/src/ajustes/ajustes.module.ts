import { Module } from '@nestjs/common';

import { AjustesController } from './ajustes.controller';
import { AjustesService } from './ajustes.service';

@Module({
  controllers: [AjustesController],
  providers: [AjustesService],
})
export class AjustesModule {}
