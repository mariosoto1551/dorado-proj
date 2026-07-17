import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ConfiguracionController } from './configuracion.controller';
import { ConfiguracionService } from './configuracion.service';

@Module({
  imports: [ClientesModule],
  controllers: [ConfiguracionController],
  providers: [ConfiguracionService, AccesoGrupoService],
  exports: [ConfiguracionService],
})
export class ConfiguracionModule {}
