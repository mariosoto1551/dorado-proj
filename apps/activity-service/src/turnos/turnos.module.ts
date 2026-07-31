import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { SelladoTurnosService } from './sellado-turnos.service';
import { TurnosController } from './turnos.controller';
import { TurnosService } from './turnos.service';

/**
 * Turnos rotativos (fase-14-21). Exporta los dos services porque los consumen
 * otros módulos: `SelladoTurnosService` lo usa el consumidor de eventos de
 * sesión, y `TurnosService` lo usan `RegistroService` (para validar de quién es
 * el turno al confirmar) y `mi-estado-hoy`.
 */
@Module({
  imports: [ClientesModule],
  controllers: [TurnosController],
  providers: [TurnosService, SelladoTurnosService, AccesoGrupoService],
  exports: [TurnosService, SelladoTurnosService],
})
export class TurnosModule {}
