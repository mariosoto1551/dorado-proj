import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { BilleteraController } from './billetera.controller';
import { BilleteraService } from './billetera.service';
import { ObjetivoService } from './objetivo.service';

/**
 * Ledger de monedas y billetera (fase-14-22). Exporta el service: el cierre
 * económico y la compra escriben el ledger a través de él, nunca directo.
 */
@Module({
  imports: [ClientesModule, ConfiguracionModule],
  controllers: [BilleteraController],
  providers: [BilleteraService, ObjetivoService, AccesoGrupoService],
  exports: [BilleteraService],
})
export class BilleteraModule {}
