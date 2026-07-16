import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ConductasController } from './conductas.controller';
import { ConductasService } from './conductas.service';

@Module({
  imports: [ClientesModule],
  controllers: [ConductasController],
  providers: [ConductasService, AccesoGrupoService],
})
export class ConductasModule {}
