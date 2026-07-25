import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { EquiposController } from './equipos.controller';
import { ReportesService } from './reportes.service';
import { TareasEquipoService } from './tareas-equipo.service';

@Module({
  imports: [ClientesModule],
  controllers: [EquiposController],
  providers: [TareasEquipoService, ReportesService, AccesoGrupoService],
})
export class EquiposModule {}
