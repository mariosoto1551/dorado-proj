import { Module } from '@nestjs/common';

import { ClientesModule } from '../clientes/clientes.module';
import { ContenidoUsuarioModule } from '../contenido-usuario/contenido-usuario.module';
import { RegistroModule } from '../registro/registro.module';
import { EstadoDeHoyInternoService } from './estado-de-hoy.service';
import { InternalHealthController } from './internal-health.controller';
import { InternalController } from './internal.controller';

/**
 * fase-14-30: importa `ContenidoUsuarioModule` por su `ConfiguracionContenidoService`,
 * que es donde viven los defaults del Grupo. El endpoint interno de configuración
 * delega ahí en vez de repetirlos: dos copias de un default se separan sin que
 * nadie lo note.
 */
@Module({
  // fase-14-31: `RegistroModule` por su `estadoHoyInterno` —la MISMA lista que
  // ve el integrante— y `ClientesModule` por identity y session.
  imports: [ContenidoUsuarioModule, RegistroModule, ClientesModule],
  controllers: [InternalController, InternalHealthController],
  providers: [EstadoDeHoyInternoService],
})
export class InternalModule {}
