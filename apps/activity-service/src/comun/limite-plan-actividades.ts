import type { Logger } from '@nestjs/common';

import type { BillingClientService } from '../clientes/billing-client.service';
import { EstadoCatalogo } from '../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';
import { LimitePlanAlcanzadoException } from './excepciones';

/**
 * Chequeo de entitlements previo a crear una Actividad ACTIVA en el grupo
 * (spec fase-05): cuenta las ACTIVA contra `limites.actividadesPorGrupo`.
 *
 * Función libre (no un provider) para que la compartan `ActividadesService` y
 * los flujos de contenido de integrantes (fase-14-10) sin cambiar constructores
 * ni duplicar la regla. Las actividades creadas por integrantes cuentan igual:
 * si no, el modo LIBRE sería un bypass del tope del plan (spec fase-14-10,
 * decisión 9).
 *
 * Si billing no está disponible se omite con warning (fail-open, misma decisión
 * de fase-04 — los límites solo viven en billing).
 */
export async function asegurarLimiteActividadesDelGrupo(
  prisma: PrismaService,
  billing: BillingClientService,
  logger: Logger,
  organizacionId: string,
  grupoId: string
): Promise<void> {
  const entitlements = await billing.resolveEntitlements(organizacionId);

  if (!entitlements) {
    logger.warn(
      `Billing no disponible — se omite el chequeo de límite de actividades para ${organizacionId}`
    );

    return;
  }

  const limite = entitlements.limites.actividadesPorGrupo;

  if (limite === null) {
    return;
  }

  const actuales = await prisma.client.actividad.count({
    where: { grupoId, estado: EstadoCatalogo.ACTIVA },
  });

  if (actuales >= limite) {
    throw new LimitePlanAlcanzadoException();
  }
}
