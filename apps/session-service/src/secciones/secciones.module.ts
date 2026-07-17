import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { MaquinaSeccionesService } from './maquina-secciones.service';
import { SeccionesController } from './secciones.controller';
import { SeccionesService } from './secciones.service';

@Module({
  imports: [ClientesModule, ConfiguracionModule],
  controllers: [SeccionesController],
  providers: [SeccionesService, MaquinaSeccionesService, AccesoGrupoService],
  exports: [SeccionesService, MaquinaSeccionesService],
})
export class SeccionesModule {}
