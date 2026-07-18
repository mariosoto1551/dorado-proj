import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { RecompensasController } from './recompensas.controller';
import { RecompensasService } from './recompensas.service';

@Module({
  imports: [ClientesModule],
  controllers: [RecompensasController],
  providers: [RecompensasService, AccesoGrupoService],
})
export class RecompensasModule {}
