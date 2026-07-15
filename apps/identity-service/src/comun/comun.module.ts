import { Module } from '@nestjs/common';

import { AccesoGrupoService } from './acceso-grupo.service';

@Module({
  providers: [AccesoGrupoService],
  exports: [AccesoGrupoService],
})
export class ComunModule {}
