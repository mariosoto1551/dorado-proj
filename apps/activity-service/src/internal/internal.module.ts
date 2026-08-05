import { Module } from '@nestjs/common';

import { ContenidoUsuarioModule } from '../contenido-usuario/contenido-usuario.module';
import { InternalHealthController } from './internal-health.controller';
import { InternalController } from './internal.controller';

/**
 * fase-14-30: importa `ContenidoUsuarioModule` por su `ConfiguracionContenidoService`,
 * que es donde viven los defaults del Grupo. El endpoint interno de configuración
 * delega ahí en vez de repetirlos: dos copias de un default se separan sin que
 * nadie lo note.
 */
@Module({
  imports: [ContenidoUsuarioModule],
  controllers: [InternalController, InternalHealthController],
})
export class InternalModule {}
