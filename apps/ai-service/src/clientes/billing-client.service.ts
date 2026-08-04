import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EntitlementsDto } from '@dorado/shared-types';

import { ClienteInternoBase } from './cliente-interno.base';

/**
 * Cliente REST interno hacia billing-service (ADR-00 §4): header
 * `x-internal-secret`, nunca a través del Gateway público. Mismo patrón que el
 * BillingClientService de activity (fase-05).
 *
 * **Diferencia deliberada con los otros servicios: acá NO hay fail-open.** En
 * activity, si billing no responde se omite el chequeo de límite con un
 * warning, porque el costo de un falso negativo es una actividad de más. Acá
 * el entitlement decide si se gasta dinero real de la plataforma contra un
 * proveedor externo, así que billing caído significa **asistente apagado**
 * hasta que vuelva. Devolver null y que el llamador corte es la decisión, y
 * está en el nombre del método.
 */
@Injectable()
export class BillingClientService extends ClienteInternoBase {
  constructor(config: ConfigService) {
    super(config, 'BILLING_INTERNAL_URL', BillingClientService.name);
  }

  /**
   * Entitlements de la organización. Devuelve `null` si billing no está
   * disponible; el llamador trata `null` como "sin feature" (fail-closed),
   * no como "seguí adelante".
   *
   * El `null` lo produce la base igual que en los clientes de lectura — lo que
   * cambia es qué significa acá, y eso lo decide `ConfiguracionService`, no
   * este archivo.
   */
  async resolveEntitlements(organizacionId: string): Promise<EntitlementsDto | null> {
    return await this.get<EntitlementsDto>(
      `/internal/billing/organizaciones/${organizacionId}/entitlements`
    );
  }
}
