import { Injectable } from '@nestjs/common';

import {
  AVISO_IA_VERSION_VIGENTE,
  CambiarConfiguracionIaRequest,
  ConfiguracionIaDto,
  TenantContext,
} from '@dorado/shared-types';

import { BillingClientService } from '../clientes/billing-client.service';
import { AvisoNoAceptadoException, FeatureNoDisponibleException } from '../comun/excepciones';
import { PrismaService } from '../prisma/prisma.service';

/** Estado del plan resuelto contra billing, ya normalizado. */
interface EstadoDelPlan {
  disponibleEnPlan: boolean;
  cuotaTokensMensuales: number | null;
}

/** Lo que hace falta de la fila para decidir sobre el consentimiento. */
interface FilaDeConsentimiento {
  aceptoAvisoEn: Date | null;
  avisoVersion: number | null;
}

/**
 * Qué versión aceptó, leyendo el `null` como corresponde (fase-14-31 decisión 11).
 *
 * Una fila con fecha de aceptación y `avisoVersion` en NULL **no es una
 * aceptación vacía**: es una del fase-14-29, anterior al campo, y vale como
 * versión 1. Sin esta lectura, subir el aviso a 2 haría ver a esas
 * organizaciones como si nunca hubieran aceptado nada, que es falso y además
 * borraría la fecha que sí dieron.
 */
function versionAceptada(fila: FilaDeConsentimiento | null): number | null {
  if (!fila || fila.aceptoAvisoEn === null) {
    return null;
  }

  return fila.avisoVersion ?? 1;
}

/** Si el consentimiento que hay cubre el aviso que rige hoy. */
function avisoAlDia(fila: FilaDeConsentimiento | null): boolean {
  const aceptada = versionAceptada(fila);

  return aceptada !== null && aceptada >= AVISO_IA_VERSION_VIGENTE;
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
    const yaAcepto = avisoAlDia(fila);

    // Habilitar exige aceptar el aviso VIGENTE, salvo que ya esté aceptado:
    // apagar y volver a prender no vuelve a preguntar (el consentimiento ya
    // está dado y registrado), pero un aviso que cambió de versión sí, porque
    // quien aceptó una lista de datos más corta no aceptó ésta (decisión 11).
    if (datos.habilitada && !yaAcepto && datos.aceptaAviso !== true) {
      throw new AvisoNoAceptadoException();
    }

    // La aceptación se REESCRIBE cuando sube la versión, y ese es el único caso
    // en que se pisa: la fecha y el usuario pasan a ser los de la aceptación
    // vigente, que es la que hay que poder mostrar y auditar. Lo que no se
    // borra nunca es al deshabilitar — un consentimiento dado es un hecho.
    const aceptacion =
      datos.habilitada && !yaAcepto
        ? {
            aceptoAvisoEn: new Date(),
            aceptoAvisoPorUsuarioId: tenant.principalId,
            avisoVersion: AVISO_IA_VERSION_VIGENTE,
          }
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
    fila: ({ habilitada: boolean } & FilaDeConsentimiento) | null,
    tokensConsumidosMes: number
  ): ConfiguracionIaDto {
    const habilitada = fila?.habilitada === true;
    // null = sin límite. Se compara explícito contra null y no con `??` para
    // que el caso "sin límite" no se confunda nunca con cuota 0 (fase-14-29:
    // una columna nullable nueva deja las filas viejas en NULL).
    const hayCuotaDisponible =
      plan.cuotaTokensMensuales === null || tokensConsumidosMes < plan.cuotaTokensMensuales;
    const avisoAceptado = avisoAlDia(fila);

    return {
      disponibleEnPlan: plan.disponibleEnPlan,
      habilitada,
      avisoAceptado,
      aceptoAvisoEn: fila?.aceptoAvisoEn?.toISOString() ?? null,
      avisoVersionAceptada: versionAceptada(fila),
      avisoVersionVigente: AVISO_IA_VERSION_VIGENTE,
      cuotaTokensMensuales: plan.cuotaTokensMensuales,
      tokensConsumidosMes,
      // El aviso entra al gate (decisión 11): una organización que dejó el
      // switch prendido con un consentimiento viejo NO puede usarlo. Es la
      // única parte del ítem que interrumpe a alguien, y es a propósito.
      puedeUsarse: plan.disponibleEnPlan && habilitada && avisoAceptado && hayCuotaDisponible,
    };
  }
}
