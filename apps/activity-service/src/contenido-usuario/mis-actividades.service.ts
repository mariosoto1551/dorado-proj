import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { ROUTING_KEYS } from '@dorado/shared-events';
import type { ActividadPropuestaCreadaPayload } from '@dorado/shared-events';
import {
  ActividadDto,
  CrearMiActividadResponse,
  MisActividadesDto,
  TenantContext,
} from '@dorado/shared-types';

import { BillingClientService } from '../clientes/billing-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  CreacionPorUsuarioDeshabilitadaException,
  LimiteActividadesPropiasAlcanzadoException,
  PuntosSobreTopeDelGrupoException,
} from '../comun/excepciones';
import { asegurarLimiteActividadesDelGrupo } from '../comun/limite-plan-actividades';
import { actividadADto, propuestaActividadADto } from '../comun/mapeadores';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import {
  EstadoCatalogo,
  EstadoPropuesta,
  ModoCreacionContenidoUsuario,
  OrigenActividad,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ConfiguracionContenidoService } from './configuracion-contenido.service';
import {
  contarCupoUsado,
  datosActividadDesdePropuesta,
} from './contenido-usuario.comun';
import type { CrearMiActividadRequest } from './dto/contenido-usuario.dto';

/**
 * Contenido propio del integrante (spec fase-14-10, Parte B.3). Según el modo
 * del Grupo:
 *
 * - `RESTRICTIVO`: no puede crear (403).
 * - `BAJO_APROBACION`: crea una `PropuestaActividad` PENDIENTE — NO existe como
 *   Actividad, así que no vale puntos ni aparece en su día hasta que el Tutor
 *   la aprueba.
 * - `LIBRE`: crea la Actividad ACTIVA al instante, más la propuesta marcada
 *   APROBADA por SYSTEM (rastro de que se creó sin revisión).
 *
 * Los puntos nunca se tocan acá: una vez ACTIVA, la actividad se completa por
 * el camino normal (`RegistroActividad` + `ActividadCompletada` → scoring), así
 * que la regla 1 sigue intacta.
 */
@Injectable()
export class MisActividadesService {
  private readonly logger = new Logger(MisActividadesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingClientService,
    private readonly acceso: AccesoGrupoService,
    private readonly configuracion: ConfiguracionContenidoService,
    private readonly eventos: EventosPublisherService
  ) {}

  /** POST /activity/grupos/:grupoId/mis-actividades — rol USUARIO. */
  async crear(
    tenant: TenantContext,
    grupoId: string,
    datos: CrearMiActividadRequest
  ): Promise<CrearMiActividadResponse> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const config = await this.configuracion.resolver(grupoId);

    if (config.modoCreacionUsuario === ModoCreacionContenidoUsuario.RESTRICTIVO) {
      throw new CreacionPorUsuarioDeshabilitadaException();
    }

    if (datos.valorPuntos > config.maxPuntosActividadUsuario) {
      throw new PuntosSobreTopeDelGrupoException(config.maxPuntosActividadUsuario);
    }

    const usuarioId = tenant.principalId;
    const cupoUsado = await contarCupoUsado(this.prisma, grupoId, usuarioId);

    if (cupoUsado >= config.maxActividadesActivasPorUsuario) {
      throw new LimiteActividadesPropiasAlcanzadoException(
        config.maxActividadesActivasPorUsuario
      );
    }

    const esLibre = config.modoCreacionUsuario === ModoCreacionContenidoUsuario.LIBRE;

    // El tope del plan solo aplica si la actividad va a quedar ACTIVA ahora
    // (decisión 9): una propuesta pendiente todavía no ocupa lugar en el
    // catálogo. En BAJO_APROBACION se revalida al aprobar.
    if (esLibre) {
      await asegurarLimiteActividadesDelGrupo(
        this.prisma,
        this.billing,
        this.logger,
        tenant.organizacionId,
        grupoId
      );
    }

    const datosPropuesta = {
      // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
      organizacionId: tenant.organizacionId,
      grupoId,
      creadaPorUsuarioId: usuarioId,
      nombre: datos.nombre,
      descripcion: datos.descripcion ?? null,
      valorPuntos: datos.valorPuntos,
      repeticionesMaximasSesion: datos.repeticionesMaximasSesion ?? 1,
      modoAlCrear: config.modoCreacionUsuario,
    };

    const creado = await this.prisma.client.$transaction(async (tx) => {
      if (!esLibre) {
        const propuesta = await tx.propuestaActividad.create({ data: datosPropuesta });

        return { propuesta, actividad: null };
      }

      const actividad = await tx.actividad.create({
        // Sin tutor detrás: en modo LIBRE nadie revisó (creadaPorTutorId null).
        data: datosActividadDesdePropuesta(datosPropuesta, null),
      });
      const propuesta = await tx.propuestaActividad.create({
        data: {
          ...datosPropuesta,
          estado: EstadoPropuesta.APROBADA,
          resueltoPorId: usuarioId,
          resueltoPorTipo: 'SYSTEM',
          resueltoEn: new Date(),
          actividadId: actividad.id,
        },
      });

      return { propuesta, actividad };
    });

    // Eventos después del commit (patrón del proyecto).
    await this.eventos.publicar<ActividadPropuestaCreadaPayload>({
      eventType: 'ActividadPropuestaCreada',
      routingKey: ROUTING_KEYS.ACTIVIDAD_PROPUESTA_CREADA,
      organizacionId: tenant.organizacionId,
      grupoId,
      payload: {
        propuestaId: creado.propuesta.id,
        organizacionId: tenant.organizacionId,
        grupoId,
        creadaPorUsuarioId: usuarioId,
        nombre: creado.propuesta.nombre,
        valorPuntos: creado.propuesta.valorPuntos,
        estado: creado.propuesta.estado,
        requiereAprobacion: !esLibre,
        actividadId: creado.actividad?.id ?? null,
      },
    });

    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId,
      actorId: usuarioId,
      actorTipo: tenant.principalType,
      accion: 'ACTIVIDAD_PROPUESTA_POR_USUARIO',
      entidadTipo: 'PropuestaActividad',
      entidadId: creado.propuesta.id,
      detalle: {
        despues: propuestaActividadADto(creado.propuesta),
        modo: config.modoCreacionUsuario,
      },
    });

    return {
      propuesta: propuestaActividadADto(creado.propuesta),
      actividad: creado.actividad ? actividadADto(creado.actividad) : null,
    };
  }

  /**
   * GET /activity/grupos/:grupoId/mis-actividades — todo lo que la pantalla del
   * integrante necesita en una sola llamada (config vigente, cupo, sus
   * actividades activas y sus propuestas con estado).
   */
  async listar(tenant: TenantContext, grupoId: string): Promise<MisActividadesDto> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const usuarioId = tenant.principalId;
    const config = await this.configuracion.resolver(grupoId);

    const [actividades, propuestas, cupoUsado] = await Promise.all([
      this.prisma.client.actividad.findMany({
        where: {
          grupoId,
          origen: OrigenActividad.USUARIO,
          creadaPorUsuarioId: usuarioId,
          estado: EstadoCatalogo.ACTIVA,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.propuestaActividad.findMany({
        where: { grupoId, creadaPorUsuarioId: usuarioId },
        orderBy: { createdAt: 'desc' },
      }),
      contarCupoUsado(this.prisma, grupoId, usuarioId),
    ]);

    return {
      modoCreacionUsuario: config.modoCreacionUsuario,
      maxPuntosActividadUsuario: config.maxPuntosActividadUsuario,
      maxActividadesActivasPorUsuario: config.maxActividadesActivasPorUsuario,
      puedeCrear:
        config.modoCreacionUsuario !== ModoCreacionContenidoUsuario.RESTRICTIVO &&
        cupoUsado < config.maxActividadesActivasPorUsuario,
      cupoUsado,
      actividades: actividades.map(actividadADto),
      propuestas: propuestas.map(propuestaActividadADto),
    };
  }

  /**
   * DELETE /activity/mis-actividades/:actividadId — el autor archiva la suya y
   * libera cupo (spec fase-14-10, decisión 11). No puede EDITARLA: eso evita el
   * truco de crearla de 1 punto, que se apruebe, y después subirla a 50.
   */
  async archivar(tenant: TenantContext, actividadId: string): Promise<ActividadDto> {
    const actividad = await this.prisma.client.actividad.findFirst({
      where: { id: actividadId },
    });

    // Mismo 404 para inexistente / de otro integrante / del catálogo del tutor:
    // no revela nada de lo que no es suyo.
    if (
      !actividad ||
      actividad.origen !== OrigenActividad.USUARIO ||
      actividad.creadaPorUsuarioId !== tenant.principalId
    ) {
      throw new NotFoundException('Actividad no encontrada');
    }

    await this.prisma.client.actividad.updateMany({
      where: { id: actividadId },
      data: { estado: EstadoCatalogo.ARCHIVADA },
    });

    await this.eventos.publicarAccionAdministrativa({
      organizacionId: actividad.organizacionId,
      grupoId: actividad.grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion: 'ACTIVIDAD_ARCHIVADA_POR_AUTOR',
      entidadTipo: 'Actividad',
      entidadId: actividadId,
      detalle: { antes: actividadADto(actividad) },
    });

    return actividadADto({ ...actividad, estado: EstadoCatalogo.ARCHIVADA });
  }
}
