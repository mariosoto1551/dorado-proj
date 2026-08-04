import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { EtiquetasModule } from '../etiquetas/etiquetas.module';
import { RecompensasController } from './recompensas.controller';
import { RecompensasService } from './recompensas.service';

@Module({
  imports: [ClientesModule, ConfiguracionModule, EtiquetasModule],
  controllers: [RecompensasController],
  providers: [RecompensasService, AccesoGrupoService],
})
export class RecompensasModule {}
