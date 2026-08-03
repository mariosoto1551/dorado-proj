import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { ContextoParticipanteService } from '../comun/contexto-participante.service';
import { ContenidoUsuarioModule } from '../contenido-usuario/contenido-usuario.module';
import { PlanDiaController } from './plan-dia.controller';
import { PlanDiaService } from './plan-dia.service';

/**
 * Plan del día del integrante (fase-14-17). Exporta `PlanDiaService` porque
 * `RegistroService` lo usa en dos puntos: leer el plan en `mi-estado-hoy` y
 * darlo de alta solo al completar (decisiones 9 y 12 de la spec).
 */
@Module({
  imports: [ClientesModule, ContenidoUsuarioModule],
  controllers: [PlanDiaController],
  providers: [ContextoParticipanteService, PlanDiaService, AccesoGrupoService],
  exports: [PlanDiaService],
})
export class PlanDiaModule {}
