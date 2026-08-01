import { Module } from '@nestjs/common';

import { BilleteraModule } from '../billetera/billetera.module';
import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { BolsasService } from './bolsas.service';
import { ComprasService } from './compras.service';
import { ProductosService } from './productos.service';
import { TiendaController } from './tienda.controller';

/** Catálogo de la tienda, bolsas, compra y entrega (fase-14-22). */
@Module({
  imports: [ClientesModule, ConfiguracionModule, BilleteraModule],
  controllers: [TiendaController],
  providers: [BolsasService, ProductosService, ComprasService, AccesoGrupoService],
})
export class TiendaModule {}
