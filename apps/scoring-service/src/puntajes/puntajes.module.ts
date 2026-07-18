import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ConsumoModule } from '../consumo/consumo.module';
import { PuntajesController } from './puntajes.controller';
import { PuntajesService } from './puntajes.service';

@Module({
  imports: [ClientesModule, ConsumoModule],
  controllers: [PuntajesController],
  providers: [PuntajesService, AccesoGrupoService],
  exports: [PuntajesService],
})
export class PuntajesModule {}
