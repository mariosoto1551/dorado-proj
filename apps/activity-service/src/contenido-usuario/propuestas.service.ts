import { Injectable, Logger } from '@nestjs/common';

import { ROUTING_KEYS } from '@dorado/shared-events';
import type { ActividadPropuestaResueltaPayload } from '@dorado/shared-events';
import { PropuestaActividadDto, TenantContext } from '@dorado/shared-types';

import { BillingClientService } from '../clientes/billing-client.service';
import { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  AutorYaNoEstaEnElGrupoException,
  PropuestaNoEncontradaException,
  PropuestaYaResueltaException,
  PuntosSobreTopeDelGrupoException,
} from '../comun/excepciones';
import { asegurarLimiteActividadesDelGrupo } from '../comun/limite-plan-actividades';
import { propuestaActividadADto } from '../comun/mapeadores';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { PropuestaActividad } from '../generated/prisma/client';
import { EstadoPropuesta } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ConfiguracionContenidoService } from './configuracion-contenido.service';
import { datosActividadDesdePropuesta } from './contenido-usuario.comun';
import type {
  ListarPropuestasQuery,
  RechazarPropuestaRequest,
} from './dto/contenido-usuario.dto';

/**
 * Moderación del Tutor sobre las propuestas de los integrantes (spec fase-14-10,
 * Parte B.4). Solo relevante en modo `BAJO_APROBACION`, pero la bandeja también
 * muestra las auto-aprobadas del modo `LIBRE` (rastro de qué creó cada uno).
 */
@Injectable()
export class PropuestasService {
  private readonly logger = new Logger(PropuestasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingClientService,
    private readonly identity: IdentityClientService,
    private readonly acceso: AccesoGrupoService,
    private readonly configuracion: ConfiguracionContenidoService,
    private readonly eventos: EventosPublisherService
  ) {}

  /** GET /activity/grupos/:grupoId/propuestas?estado= — Tutor/ORG_ADMIN. */
  async listar(
    tenant: TenantContext,
    grupoId: string,
    query: ListarPropuestasQuery
  ): Promise<PropuestaActividadDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const propuestas = await this.prisma.client.propuestaActividad.findMany({
      where: { grupoId, ...(query.estado && { estado: query.estado }) },
      orderBy: { createdAt: 'desc' },
    });

    return propuestas.map(propuestaActividadADto);
  }

  /**
   * POST /activity/propuestas/:id/aprobar — sin body: la propuesta ya trae todo.
   * Crea la Actividad (recién acá empieza a existir y a poder valer puntos) y
   * marca la propuesta APROBADA, en una transacción.
   */
  async aprobar(tenant: TenantContext, propuestaId: string): Promise<PropuestaActividadDto> {
    const propuesta = await this.buscarPendiente(propuestaId);

    // El autor tiene que seguir en el grupo: aprobar una actividad personal de
    // alguien que ya no está dejaría una fila huérfana que nadie puede completar.
    // Se valida contra la membresía real del grupo (identity resuelve por
    // UsuarioGrupo, multi-grupo de fase-14), no por `Usuario.grupoId` de origen.
    const usuarios = await this.identity.usuariosDelGrupo(propuesta.grupoId);
    const autor = usuarios.find(
      (usuario) => usuario.id === propuesta.creadaPorUsuarioId
    );

    if (!autor || autor.organizacionId !== tenant.organizacionId) {
      throw new AutorYaNoEstaEnElGrupoException();
    }

    // Se revalida el tope vigente: si el Tutor lo bajó después de que el
    // integrante propuso, la propuesta cara ya no se puede aprobar tal cual.
    const config = await this.configuracion.resolver(propuesta.grupoId);

    if (propuesta.valorPuntos > config.maxPuntosActividadUsuario) {
      throw new PuntosSobreTopeDelGrupoException(config.maxPuntosActividadUsuario);
    }

    await asegurarLimiteActividadesDelGrupo(
      this.prisma,
      this.billing,
      this.logger,
      propuesta.organizacionId,
      propuesta.grupoId
    );

    const ahora = new Date();

    const resuelta = await this.prisma.client.$transaction(async (tx) => {
      const actividad = await tx.actividad.create({
        // El Tutor que aprueba es quien la puso en el catálogo.
        data: datosActividadDesdePropuesta(propuesta, tenant.principalId),
      });

      // updateMany (no update): pasa por el filtro automático de tenant.
      await tx.propuestaActividad.updateMany({
        where: { id: propuestaId, estado: EstadoPropuesta.PENDIENTE },
        data: {
          estado: EstadoPropuesta.APROBADA,
          resueltoPorId: tenant.principalId,
          resueltoPorTipo: 'TUTOR',
          resueltoEn: ahora,
          actividadId: actividad.id,
        },
      });

      const fila: PropuestaActividad = {
        ...propuesta,
        ...this.marcaDeResolucion(tenant, ahora),
        estado: EstadoPropuesta.APROBADA,
        actividadId: actividad.id,
      };

      return fila;
    });

    await this.publicarResolucion(resuelta, null);

    await this.eventos.publicarAccionAdministrativa({
      organizacionId: propuesta.organizacionId,
      grupoId: propuesta.grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion: 'ACTIVIDAD_PROPUESTA_APROBADA',
      entidadTipo: 'PropuestaActividad',
      entidadId: propuestaId,
      detalle: {
        antes: propuestaActividadADto(propuesta),
        despues: propuestaActividadADto(resuelta),
      },
    });

    return propuestaActividadADto(resuelta);
  }

  /** POST /activity/propuestas/:id/rechazar — sin efecto en puntos ni catálogo. */
  async rechazar(
    tenant: TenantContext,
    propuestaId: string,
    datos: RechazarPropuestaRequest
  ): Promise<PropuestaActividadDto> {
    const propuesta = await this.buscarPendiente(propuestaId);
    const ahora = new Date();
    const motivo = datos.motivo ?? null;

    await this.prisma.client.propuestaActividad.updateMany({
      where: { id: propuestaId, estado: EstadoPropuesta.PENDIENTE },
      data: {
        estado: EstadoPropuesta.RECHAZADA,
        resueltoPorId: tenant.principalId,
        resueltoPorTipo: 'TUTOR',
        resueltoEn: ahora,
        motivoRechazo: motivo,
      },
    });

    const resuelta: PropuestaActividad = {
      ...propuesta,
      ...this.marcaDeResolucion(tenant, ahora),
      estado: EstadoPropuesta.RECHAZADA,
      motivoRechazo: motivo,
    };

    await this.publicarResolucion(resuelta, motivo);

    await this.eventos.publicarAccionAdministrativa({
      organizacionId: propuesta.organizacionId,
      grupoId: propuesta.grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion: 'ACTIVIDAD_PROPUESTA_RECHAZADA',
      entidadTipo: 'PropuestaActividad',
      entidadId: propuestaId,
      detalle: {
        antes: propuestaActividadADto(propuesta),
        despues: propuestaActividadADto(resuelta),
      },
    });

    return propuestaActividadADto(resuelta);
  }

  /** Campos comunes de resolución por un Tutor (evita repetirlos en 2 lugares). */
  private marcaDeResolucion(tenant: TenantContext, ahora: Date) {
    return {
      resueltoPorId: tenant.principalId,
      resueltoPorTipo: 'TUTOR',
      resueltoEn: ahora,
    };
  }

  /**
   * Propuesta PENDIENTE accesible para el tenant (el filtro automático agrega
   * organizacionId). 404 si no existe o no es de su organización; 409 si ya fue
   * aprobada o rechazada — así una doble aprobación no crea dos actividades.
   */
  private async buscarPendiente(propuestaId: string): Promise<PropuestaActividad> {
    const propuesta = await this.prisma.client.propuestaActividad.findFirst({
      where: { id: propuestaId },
    });

    if (!propuesta) {
      throw new PropuestaNoEncontradaException();
    }

    if (propuesta.estado !== EstadoPropuesta.PENDIENTE) {
      throw new PropuestaYaResueltaException();
    }

    return propuesta;
  }

  private async publicarResolucion(
    propuesta: PropuestaActividad,
    motivoRechazo: string | null
  ): Promise<void> {
    await this.eventos.publicar<ActividadPropuestaResueltaPayload>({
      eventType: 'ActividadPropuestaResuelta',
      routingKey: ROUTING_KEYS.ACTIVIDAD_PROPUESTA_RESUELTA,
      organizacionId: propuesta.organizacionId,
      grupoId: propuesta.grupoId,
      payload: {
        propuestaId: propuesta.id,
        organizacionId: propuesta.organizacionId,
        grupoId: propuesta.grupoId,
        creadaPorUsuarioId: propuesta.creadaPorUsuarioId,
        nombre: propuesta.nombre,
        estado: propuesta.estado,
        resueltoPorId: propuesta.resueltoPorId ?? '',
        resueltoPorTipo: propuesta.resueltoPorTipo ?? 'TUTOR',
        actividadId: propuesta.actividadId,
        motivoRechazo,
      },
    });
  }
}
