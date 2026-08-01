import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { CierreEconomicoService } from './cierre-economico.service';
import { RendimientosController } from './rendimientos.controller';
import { RendimientosService } from './rendimientos.service';

/**
 * El cierre económico de la Sección (fase-14-22): la configuración de cuánto
 * rinde cada zona, y el servicio que la aplica cuando llega `ZonaAlcanzada`.
 * Exporta `CierreEconomicoService` porque lo dispara `ZonasConsumer`.
 */
@Module({
  imports: [ClientesModule],
  controllers: [RendimientosController],
  providers: [RendimientosService, CierreEconomicoService, AccesoGrupoService],
  exports: [CierreEconomicoService],
})
export class CierreModule {}
