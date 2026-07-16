import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ActividadesController } from './actividades.controller';
import { ActividadesService } from './actividades.service';

@Module({
  imports: [ClientesModule],
  controllers: [ActividadesController],
  providers: [ActividadesService, AccesoGrupoService],
})
export class ActividadesModule {}
