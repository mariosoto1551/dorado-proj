import { Injectable, Logger } from '@nestjs/common';

import type { EventEnvelope, OrganizacionCreadaPayload } from '@dorado/shared-events';
import type {
  CodigoPlan as CodigoPlanDto,
  EntitlementsDto,
  TenantContext,
} from '@dorado/shared-types';

import { SuscripcionNoEncontradaException } from '../comun/excepciones';
import { entitlementsDePlan, planADto, suscripcionAWire } from '../comun/mapeadores';
import type { Plan } from '../generated/prisma/client';
import { CodigoPlan, EstadoSuscripcion, FuenteSuscripcion } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  MiOrganizacionResponse,
  PlanOrganizacionResponse,
  SuscripcionWire,
} from './dto/suscripciones.dto';

/** Identificador de este consumidor en la tabla EventoProcesado (ADR-00 §5). */
const CONSUMIDOR = 'billing-service';

@Injectable()
export class SuscripcionesService {
  private readonly logger = new Logger(SuscripcionesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------- Consumo de eventos ----------

  /**
   * Efecto de `OrganizacionCreada` (event-catalog): crear la Suscripcion FREE
   * AUTOMATICA de la organización. Idempotente en dos niveles: descarta
   * `eventId` ya procesados (tabla EventoProcesado) y no duplica la
   * suscripción si ya existe una para la organización (reentrega con otro
   * eventId, o carrera entre dos entregas simultáneas).
   */
  async procesarOrganizacionCreada(
    envelope: EventEnvelope<OrganizacionCreadaPayload>
  ): Promise<void> {
    const yaProcesado = await this.prisma.client.eventoProcesado.findUnique({
      where: { eventId: envelope.eventId },
    });

    if (yaProcesado) {
      this.logger.debug(`Evento ${envelope.eventId} ya procesado — descartado`);
      return;
    }

    const planFree = await this.planPorCodigo(CodigoPlan.FREE);
    const organizacionId = envelope.payload.organizacionId;

    try {
      await this.prisma.client.$transaction(async (tx) => {
        const existente = await tx.suscripcion.findFirst({
          where: { organizacionId },
        });

        if (!existente) {
          await tx.suscripcion.create({
            data: {
              organizacionId,
              planId: planFree.id,
              fuente: FuenteSuscripcion.AUTOMATICA,
            },
          });
        }

        await tx.eventoProcesado.create({
          data: { eventId: envelope.eventId, consumidor: CONSUMIDOR },
        });
      });
    } catch (error) {
      // P2002 en eventoProcesado.eventId o suscripcion.organizacionId: otra
      // entrega concurrente ganó la carrera — el efecto ya está aplicado.
      if ((error as { code?: string })?.code === 'P2002') {
        this.logger.debug(`Evento ${envelope.eventId} procesado en paralelo — descartado`);
        return;
      }

      throw error;
    }

    this.logger.log(
      `Suscripción FREE asegurada para organización ${organizacionId} (evento ${envelope.eventId})`
    );
  }

  // ---------- Endpoints internos (ADR-00 §4) ----------

  async planDeOrganizacion(organizacionId: string): Promise<PlanOrganizacionResponse> {
    const plan = await this.planVigente(organizacionId);

    return { codigo: plan.codigo as PlanOrganizacionResponse['codigo'] };
  }

  async entitlementsDeOrganizacion(organizacionId: string): Promise<EntitlementsDto> {
    const plan = await this.planVigente(organizacionId);

    return entitlementsDePlan(plan);
  }

  /**
   * GET /internal/billing/organizaciones/:id/suscripcion — usado por el panel
   * de PLATFORM_ADMIN (fase-14-05) para el detalle de una organización.
   */
  async suscripcionDeOrganizacion(organizacionId: string): Promise<SuscripcionWire> {
    const suscripcion = await this.prisma.client.suscripcion.findFirst({
      where: { organizacionId },
      include: { plan: true },
    });

    if (!suscripcion) {
      throw new SuscripcionNoEncontradaException();
    }

    return suscripcionAWire(suscripcion, suscripcion.plan.codigo as CodigoPlanDto);
  }

  /**
   * POST /internal/billing/organizaciones/:id/plan — cambio de plan por el
   * PLATFORM_ADMIN (fase-14-05). Reemplaza el UPDATE manual en base de la nota
   * de Fase 4. NO es la pasarela de pagos (ítem #3): es asignación manual.
   *
   * Idempotente: poner el mismo plan dos veces no rompe. La `fuente` pasa a
   * MANUAL (dejó de ser la asignación automática del alta). Si no existe
   * suscripción todavía (evento de alta no llegó), se crea.
   */
  async cambiarPlan(organizacionId: string, codigo: CodigoPlan): Promise<SuscripcionWire> {
    const plan = await this.planPorCodigo(codigo);

    const suscripcion = await this.prisma.client.suscripcion.upsert({
      where: { organizacionId },
      create: {
        organizacionId,
        planId: plan.id,
        fuente: FuenteSuscripcion.MANUAL,
        estado: EstadoSuscripcion.ACTIVA,
      },
      update: {
        planId: plan.id,
        fuente: FuenteSuscripcion.MANUAL,
        estado: EstadoSuscripcion.ACTIVA,
      },
      include: { plan: true },
    });

    this.logger.log(
      `Plan de organización ${organizacionId} cambiado a ${codigo} (fuente MANUAL, panel de plataforma)`
    );

    return suscripcionAWire(suscripcion, suscripcion.plan.codigo as CodigoPlanDto);
  }

  // ---------- Endpoint autenticado ----------

  /** GET /billing/mi-organizacion (solo ORG_ADMIN, organización del JWT). */
  async miOrganizacion(tenant: TenantContext): Promise<MiOrganizacionResponse> {
    const suscripcion = await this.prisma.client.suscripcion.findFirst({
      where: { organizacionId: tenant.organizacionId },
      include: { plan: true },
    });

    if (!suscripcion) {
      throw new SuscripcionNoEncontradaException();
    }

    return {
      suscripcion: suscripcionAWire(suscripcion, suscripcion.plan.codigo as CodigoPlanDto),
      plan: planADto(suscripcion.plan),
    };
  }

  // ---------- Internos ----------

  /**
   * Plan vigente de una organización: el de su suscripción ACTIVA. Sin
   * suscripción (el evento todavía no llegó, o base recién creada) se resuelve
   * FREE — es el plan por defecto de toda organización nueva, y así el llamador
   * (identity en login) no falla por el retardo natural del evento.
   */
  private async planVigente(organizacionId: string): Promise<Plan> {
    const suscripcion = await this.prisma.client.suscripcion.findFirst({
      where: { organizacionId, estado: EstadoSuscripcion.ACTIVA },
      include: { plan: true },
    });

    if (suscripcion) {
      return suscripcion.plan;
    }

    return await this.planPorCodigo(CodigoPlan.FREE);
  }

  private async planPorCodigo(codigo: CodigoPlan): Promise<Plan> {
    const plan = await this.prisma.client.plan.findUnique({ where: { codigo } });

    if (!plan) {
      // El seed corre al bootstrap — si falta, es un despliegue roto, no un 404.
      throw new Error(`Plan ${codigo} no existe en billing_db (¿corrió el seed?)`);
    }

    return plan;
  }
}
