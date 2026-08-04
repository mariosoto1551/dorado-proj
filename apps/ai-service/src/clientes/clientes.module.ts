import { Module } from '@nestjs/common';

import { ActivityClientService } from './activity-client.service';
import { BillingClientService } from './billing-client.service';
import { IdentityClientService } from './identity-client.service';
import { RewardsClientService } from './rewards-client.service';
import { ScoringClientService } from './scoring-client.service';

/**
 * Clientes REST internos salientes (ADR-00 §4).
 *
 * **Invariante del ítem (fase-14-29 decisión 6): todos son de LECTURA.**
 * `ai-service` no conoce ningún camino que mute la base de otro servicio —
 * aplicar una propuesta lo hace el frontend con el JWT del Tutor contra los
 * endpoints públicos que ya existen. Si algún día aparece acá un método que no
 * sea GET, la decisión estructural del ítem se rompió y hay que volver a la
 * spec antes de seguir.
 *
 * El invariante no depende de que alguien lea este comentario: todos los
 * clientes extienden `ClienteInternoBase`, que expone `get` y nada más, y
 * `clientes-solo-lectura.spec.ts` lo verifica sobre el código fuente.
 */
@Module({
  providers: [
    BillingClientService,
    ActivityClientService,
    IdentityClientService,
    ScoringClientService,
    RewardsClientService,
  ],
  exports: [
    BillingClientService,
    ActivityClientService,
    IdentityClientService,
    ScoringClientService,
    RewardsClientService,
  ],
})
export class ClientesModule {}
