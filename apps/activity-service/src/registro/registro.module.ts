import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { PlanDiaModule } from '../plan-dia/plan-dia.module';
import { TurnosModule } from '../turnos/turnos.module';
import { RegistroController } from './registro.controller';
import { RegistroService } from './registro.service';

// Sin AccesoGrupoService a propósito: acá no llega ningún grupoId por URL —
// el grupo sale de la fila de catálogo (ya tenant-filtrada) y el usuario
// objetivo se valida contra identity dentro del service.
@Module({
  imports: [ClientesModule, PlanDiaModule, TurnosModule],
  controllers: [RegistroController],
  providers: [RegistroService],
})
export class RegistroModule {}
