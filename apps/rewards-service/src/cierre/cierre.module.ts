import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { CierreEconomicoService } from './cierre-economico.service';
import { RendimientosAccionesService } from './rendimientos-acciones.service';
import { RendimientosController } from './rendimientos.controller';
import { RendimientosService } from './rendimientos.service';

/**
 * Las DOS fuentes de la economía y su configuración:
 * - por zona, al cerrar la Sección (fase-14-22): `RendimientosService` +
 *   `CierreEconomicoService`, que lo aplica cuando llega `ZonaAlcanzada`.
 * - por acción, al instante (fase-14-28): `RendimientosAccionesService`. Lo
 *   aplica `AccionesConsumer`, que vive en ConsumoModule y usa
 *   `RendimientoAccionService` a través de su propio servicio.
 *
 * Exporta `CierreEconomicoService` porque lo dispara `ZonasConsumer`.
 */
@Module({
  imports: [ClientesModule, ConfiguracionModule],
  controllers: [RendimientosController],
  providers: [
    RendimientosService,
    RendimientosAccionesService,
    CierreEconomicoService,
    AccesoGrupoService,
  ],
  exports: [CierreEconomicoService],
})
export class CierreModule {}
