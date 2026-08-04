import { Module } from '@nestjs/common';

import { MonedasPorAccionService } from './monedas-por-accion.service';

/**
 * La segunda fuente de la economía (fase-14-28): lo que el participante hace
 * durante la semana también paga. Solo el servicio — la configuración de cuánto
 * paga cada acción vive en `CierreModule`, al lado de la de las zonas, para que
 * el Tutor las vea juntas.
 */
@Module({
  providers: [MonedasPorAccionService],
  exports: [MonedasPorAccionService],
})
export class AccionesModule {}
