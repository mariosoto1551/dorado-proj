import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { EtiquetasController } from './etiquetas.controller';
import { EtiquetasService } from './etiquetas.service';

/**
 * Etiquetas del catálogo (fase-14-26). Exporta el service porque lo consumen
 * `RecompensasService` (chips en la lista y filtro por etiqueta) y
 * `ProductosService` (creación masiva) — la etiqueta no tiene comportamiento
 * propio, así que su valor está justo en que otros la usen.
 */
@Module({
  imports: [ClientesModule],
  controllers: [EtiquetasController],
  providers: [EtiquetasService, AccesoGrupoService],
  exports: [EtiquetasService],
})
export class EtiquetasModule {}
