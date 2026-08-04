import { Injectable } from '@nestjs/common';

import { CambiarConfiguracionIaRequest, ConfiguracionIaDto, TenantContext } from '@dorado/shared-types';

import { BillingClientService } from '../clientes/billing-client.service';
import { AvisoNoAceptadoException, FeatureNoDisponibleException } from '../comun/excepciones';
import { PrismaService } from '../prisma/prisma.service';

/** Estado del plan resuelto contra billing, ya normalizado. */
interface EstadoDelPlan {
  disponibleEnPlan: boolean;
  cuotaTokensMensuales: number | null;
}

@Injectable()
export class ConfiguracionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingClientService
  ) {}

  /** `GET /ai/configuracion`. Nunca lanza: es la pantalla que explica por qué no se puede. */
  async obtener(tenant: TenantContext): Promise<ConfiguracionIaDto> {
    const plan = await this.estadoDelPlan(tenant.organizacionId);
    const fila = await this.prisma.client.configuracionIaOrganizacion.findUnique({
      where: { organizacionId: tenant.organizacionId },
    });
    const tokensConsumidosMes = await this.tokensConsumidosMes(tenant.organizacionId);

    return this.aDto(plan, fila, tokensConsumidosMes);
  }

  /**
   * `PUT /ai/configuracion` — solo ORG_ADMIN (lo exige el controller).
   *
   * La fila nace acá o en `obtener`, lo que pase primero: no hay evento de
   * alta que la cree y una organización que nunca abre la pantalla no
   * necesita una (fase-14-29 decisión 5).
   */
  async cambiar(
    tenant: TenantContext,
    datos: CambiarConfiguracionIaRequest
  ): Promise<ConfiguracionIaDto> {
    const plan = await this.estadoDelPlan(tenant.organizacionId);

    if (!plan.disponibleEnPlan) {
      throw new FeatureNoDisponibleException();
    }

    const fila = await this.prisma.client.configuracionIaOrganizacion.findUnique({
      where: { organizacionId: tenant.organizacionId },
    });
    const yaAcepto = fila?.aceptoAvisoEn != null;

    // Habilitar exige aceptar el aviso, salvo que ya se haya aceptado antes:
    // apagar y volver a prender no vuelve a preguntar (el consentimiento ya
    // está dado y registrado).
    if (datos.habilitada && !yaAcepto && datos.aceptaAviso !== true) {
      throw new AvisoNoAceptadoException();
    }

    // El consentimiento se escribe una sola vez y NO se borra al deshabilitar:
    // un consentimiento dado es un hecho, no un estado.
    const aceptacion =
      datos.habilitada && !yaAcepto
        ? { aceptoAvisoEn: new Date(), aceptoAvisoPorUsuarioId: tenant.principalId }
        : {};

    const actualizada = await this.prisma.client.configuracionIaOrganizacion.upsert({
      where: { organizacionId: tenant.organizacionId },
      create: {
        organizacionId: tenant.organizacionId,
        habilitada: datos.habilitada,
        ...aceptacion,
      },
      update: { habilitada: datos.habilitada, ...aceptacion },
    });
    const tokensConsumidosMes = await this.tokensConsumidosMes(tenant.organizacionId);

    return this.aDto(plan, actualizada, tokensConsumidosMes);
  }

  /**
   * Tokens consumidos en el mes calendario en curso, sumando el ledger
   * (fase-14-29 decisión 8): no hay contador mutable en ninguna tabla.
   *
   * `Mensaje` no está en MODELOS_TENANT, así que el `organizacionId` del where
   * es explícito y obligatorio — no se delega en la extensión de Prisma.
   */
  async tokensConsumidosMes(organizacionId: string, ahora: Date = new Date()): Promise<number> {
    const inicioDeMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
    const suma = await this.prisma.client.mensaje.aggregate({
      where: { organizacionId, createdAt: { gte: inicioDeMes } },
      _sum: { tokensEntrada: true, tokensSalida: true },
    });

    return (suma._sum.tokensEntrada ?? 0) + (suma._sum.tokensSalida ?? 0);
  }

  /**
   * Billing caído se trata como "sin feature" (fail-closed): el entitlement
   * decide si se gasta dinero real contra un proveedor externo, así que la
   * duda se resuelve apagando. Es lo contrario del fail-open de fase-04, y a
   * propósito.
   */
  private async estadoDelPlan(organizacionId: string): Promise<EstadoDelPlan> {
    const entitlements = await this.billing.resolveEntitlements(organizacionId);

    return {
      disponibleEnPlan: entitlements?.features.asistenteIa === true,
      // Sin `?? 0`: en este modelo `null` significa SIN LÍMITE, así que
      // colapsar el null del plan a 0 diría lo contrario de lo que dice
      // billing. El 0 es solo para billing caído, donde además
      // `disponibleEnPlan` ya es false y la cuota no se llega a mirar.
      cuotaTokensMensuales: entitlements ? entitlements.limites.tokensIaMensuales : 0,
    };
  }

  private aDto(
    plan: EstadoDelPlan,
    fila: { habilitada: boolean; aceptoAvisoEn: Date | null } | null,
    tokensConsumidosMes: number
  ): ConfiguracionIaDto {
    const habilitada = fila?.habilitada === true;
    // null = sin límite. Se compara explícito contra null y no con `??` para
    // que el caso "sin límite" no se confunda nunca con cuota 0 (fase-14-29:
    // una columna nullable nueva deja las filas viejas en NULL).
    const hayCuotaDisponible =
      plan.cuotaTokensMensuales === null || tokensConsumidosMes < plan.cuotaTokensMensuales;

    return {
      disponibleEnPlan: plan.disponibleEnPlan,
      habilitada,
      avisoAceptado: fila?.aceptoAvisoEn != null,
      aceptoAvisoEn: fila?.aceptoAvisoEn?.toISOString() ?? null,
      cuotaTokensMensuales: plan.cuotaTokensMensuales,
      tokensConsumidosMes,
      puedeUsarse: plan.disponibleEnPlan && habilitada && hayCuotaDisponible,
    };
  }
}
