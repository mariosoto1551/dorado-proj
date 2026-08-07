import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AjustesController } from './ajustes.controller';
import { AjustesService } from './ajustes.service';

/**
 * `ClientesModule` NO es global (a diferencia de Prisma y Eventos): quien
 * necesita `IdentityClientService` o `SessionClientService` lo importa, igual
 * que `PuntajesModule` y `DescalificacionesModule`.
 *
 * Faltaba, y el servicio **no arrancaba** (`UnknownDependenciesException` en el
 * bootstrap). No lo vio nadie hasta correr el stack de verdad porque los tests
 * de este service construyen las dependencias a mano: un módulo mal cableado es
 * invisible para un unit test, para el lint y para el build.
 */
@Module({
  imports: [ClientesModule],
  controllers: [AjustesController],
  providers: [AjustesService],
})
export class AjustesModule {}
