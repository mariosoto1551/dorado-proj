import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { PropuestasController } from './propuestas.controller';
import { PropuestasService } from './propuestas.service';

/**
 * Propuestas del asistente (fase-14-29 tanda 5).
 *
 * Importa `ClientesModule` **solo para leer**: las referencias cruzadas que el
 * modelo mete en una propuesta (roles, personas, equipos, actividades) hay que
 * verificar que existan en el grupo antes de guardarla, y eso es un GET.
 */
@Module({
  imports: [ClientesModule],
  controllers: [PropuestasController],
  providers: [PropuestasService],
  exports: [PropuestasService],
})
export class PropuestasModule {}
