import { Module } from '@nestjs/common';

import { BillingClientService } from './billing-client.service';

/**
 * Clientes REST internos salientes (ADR-00 §4).
 *
 * **Invariante del ítem (fase-14-29 decisión 6): todos son de LECTURA.**
 * `ai-service` no conoce ningún camino que mute la base de otro servicio —
 * aplicar una propuesta lo hace el frontend con el JWT del Tutor contra los
 * endpoints públicos que ya existen. Si algún día aparece acá un método que no
 * sea GET, la decisión estructural del ítem se rompió y hay que volver a la
 * spec antes de seguir.
 */
@Module({
  providers: [BillingClientService],
  exports: [BillingClientService],
})
export class ClientesModule {}
