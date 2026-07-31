import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { HistorialController } from './historial.controller';
import { HistorialService } from './historial.service';
import { NotasService } from './notas.service';

// Con AccesoGrupoService: acá el grupoId SÍ llega por URL (fase-14-18).
@Module({
  imports: [ClientesModule],
  controllers: [HistorialController],
  providers: [HistorialService, NotasService, AccesoGrupoService],
})
export class HistorialModule {}
