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
  // fase-14-17: `PlanDiaService` necesita saber si el Grupo tiene el plan del
  // día encendido, y esa config vive acá (es la misma fila del ítem 10).
  exports: [ConfiguracionContenidoService],
})
export class ContenidoUsuarioModule {}
