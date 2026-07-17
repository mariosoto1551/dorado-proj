import { Module } from '@nestjs/common';

import { IdentityClientService } from './identity-client.service';

/**
 * Clientes REST internos (ADR-00 §4) compartidos por configuracion, secciones
 * y el scheduler. El caché de 5 min de Grupos vive en el service (singleton).
 */
@Module({
  providers: [IdentityClientService],
  exports: [IdentityClientService],
})
export class ClientesModule {}
