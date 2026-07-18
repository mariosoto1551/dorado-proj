import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { UmbralesController } from './umbrales.controller';
import { UmbralesService } from './umbrales.service';

@Module({
  imports: [ClientesModule],
  controllers: [UmbralesController],
  providers: [UmbralesService, AccesoGrupoService],
})
export class UmbralesModule {}
