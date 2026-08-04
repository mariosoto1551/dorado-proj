import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { HerramientasService } from './herramientas.service';

/**
 * Las herramientas de LECTURA del asistente (fase-14-29 tanda 3).
 *
 * Sin controller: nada de esto se expone por HTTP. Lo consume el loop de la
 * tanda 4, que es el único que decide cuándo el modelo puede llamar algo.
 *
 * Exporta también `AccesoGrupoService` porque es el único constructor válido
 * de un `ContextoHerramienta`: quien quiera ejecutar una herramienta tiene que
 * pasar por él, y esa es justamente la idea.
 */
@Module({
  imports: [ClientesModule],
  providers: [HerramientasService, AccesoGrupoService],
  exports: [HerramientasService, AccesoGrupoService],
})
export class HerramientasModule {}
