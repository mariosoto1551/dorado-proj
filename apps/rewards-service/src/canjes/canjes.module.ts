import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { CanjesController } from './canjes.controller';
import { CanjesService } from './canjes.service';

@Module({
  imports: [ClientesModule],
  controllers: [CanjesController],
  providers: [CanjesService, AccesoGrupoService],
})
export class CanjesModule {}
