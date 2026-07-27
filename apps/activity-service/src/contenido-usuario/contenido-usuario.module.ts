import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ConfiguracionContenidoService } from './configuracion-contenido.service';
import { ContenidoUsuarioController } from './contenido-usuario.controller';
import { MisActividadesService } from './mis-actividades.service';
import { PropuestasService } from './propuestas.service';

/** Contenido creado por los integrantes, gated por config del Grupo (fase-14-10). */
@Module({
  imports: [ClientesModule],
  controllers: [ContenidoUsuarioController],
  providers: [
    ConfiguracionContenidoService,
    MisActividadesService,
    PropuestasService,
    AccesoGrupoService,
  ],
})
export class ContenidoUsuarioModule {}
