import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { ContextoParticipanteService } from '../comun/contexto-participante.service';
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
  providers: [ContextoParticipanteService, RegistroService],
  // fase-14-31: lo exporta para el endpoint interno de estado del día, que
  // necesita la MISMA lista que ve el integrante — componerla de nuevo sería
  // reimplementar las reglas de visibilidad de cinco ítems.
  exports: [RegistroService],
})
export class RegistroModule {}
