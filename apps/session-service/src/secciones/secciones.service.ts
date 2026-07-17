import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { ROUTING_KEYS } from '@dorado/shared-events';
import { SeccionDto, SesionDto, TenantContext } from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import { proximaOcurrencia } from '../comun/cron';
import { ConfiguracionEfectiva, seccionADto, sesionADto } from '../comun/mapeadores';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Seccion, Sesion } from '../generated/prisma/client';
import { EstadoSeccion, EstadoSesion, ModoSesion } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ExtenderSesionRequest,
  ListarSeccionesQuery,
  SeccionConSesionesResponse,
} from './dto/secciones.dto';
import {
  eventoDeSesion,
  MaquinaSeccionesService,
  type EventoSesiones,
} from './maquina-secciones.service';

type SeccionConSesiones = Seccion & { sesiones: Sesion[] };

/**
 * Endpoints públicos de Sección/Sesión (spec fase-06). Las transiciones
 * compuestas corren en `$transaction` vía MaquinaSeccionesService y los
 * eventos se publican DESPUÉS del commit (mismo patrón que identity fase-02).
 */
@Injectable()
export class SeccionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoGrupoService,
    private readonly configuracion: ConfiguracionService,
    private readonly maquina: MaquinaSeccionesService,
    private readonly eventos: EventosPublisherService,
    private readonly identity: IdentityClientService
  ) {}

  /** POST /session/grupos/:grupoId/secciones/iniciar — solo modo MANUAL. */
  async iniciar(tenant: TenantContext, grupoId: string): Promise<SeccionConSesionesResponse> {
    await this.acceso.asegurarAccesoEscritura(tenant, grupoId);

    const config = await this.configuracion.efectiva(grupoId);

    if (config.modo !== ModoSesion.MANUAL) {
      throw new ConflictException(
        'El grupo está en modo AUTOMATICO — las secciones las abre el scheduler'
      );
    }

    let resultado: Awaited<ReturnType<MaquinaSeccionesService['abrirSeccion']>>;

    try {
      resultado = await this.prisma.client.$transaction(async (tx) => {
        const vigente = await tx.seccion.findFirst({
          where: { grupoId, estado: { not: EstadoSeccion.CERRADA } },
        });

        if (vigente) {
          throw new ConflictException(
            'Ya hay una Sección abierta o en evaluación en este grupo'
          );
        }

        return await this.maquina.abrirSeccion(tx, {
          organizacionId: tenant.organizacionId,
          grupoId,
        });
      });
    } catch (error) {
      throw traducirCarreraDeNumero(error);
    }

    await this.eventos.publicarTodos(resultado.eventos);

    return { ...seccionADto(resultado.seccion), sesiones: [sesionADto(resultado.sesion)] };
  }

  /** GET /session/grupos/:grupoId/secciones?estado= */
  async listar(
    tenant: TenantContext,
    grupoId: string,
    query: ListarSeccionesQuery
  ): Promise<SeccionDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const secciones = await this.prisma.client.seccion.findMany({
      // El filtro organizacionId (+ grupoId IN grupoIds) lo agrega la tenant
      // extension; grupoId acá acota al grupo pedido dentro de los accesibles.
      where: { grupoId, ...(query.estado && { estado: query.estado }) },
      orderBy: { numero: 'asc' },
    });

    return secciones.map(seccionADto);
  }

  /** GET /session/grupos/:grupoId/secciones/actual — la no-CERRADA más reciente, o null. */
  async actual(
    tenant: TenantContext,
    grupoId: string
  ): Promise<SeccionConSesionesResponse | null> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    return await this.buscarActual(grupoId);
  }

  /** GET /session/secciones/:id — detalle + sus Sesiones. */
  async detalle(tenant: TenantContext, id: string): Promise<SeccionConSesionesResponse> {
    const seccion = (await this.prisma.client.seccion.findFirst({
      where: { id },
      include: { sesiones: { orderBy: { numero: 'asc' } } },
    })) as SeccionConSesiones | null;

    if (!seccion) {
      throw new NotFoundException('Sección no encontrada');
    }

    return aResponseConSesiones(seccion);
  }

  /** POST /session/secciones/:id/sesiones/abrir-siguiente — solo modo MANUAL. */
  async abrirSiguiente(tenant: TenantContext, seccionId: string): Promise<SesionDto> {
    const seccion = await this.buscarSeccionAccesible(seccionId);
    const config = await this.configuracion.efectiva(seccion.grupoId);

    if (config.modo !== ModoSesion.MANUAL) {
      throw new ConflictException(
        'El grupo está en modo AUTOMATICO — las sesiones las abre el scheduler'
      );
    }

    if (seccion.estado !== EstadoSeccion.ABIERTA) {
      throw new ConflictException('La sección no está ABIERTA');
    }

    const ahora = new Date();

    let resultado: { sesion: Sesion; eventos: EventoSesiones[] };

    try {
      resultado = await this.prisma.client.$transaction(async (tx) => {
        const maxNumero = await this.maquina.maxNumeroSesion(tx, seccion.id);

        if (maxNumero >= config.sesionesPorSeccion) {
          throw new ConflictException(
            'Ya se abrieron todas las sesiones de la sección (sesionesPorSeccion) — corresponde forzar la evaluación'
          );
        }

        const cierre = await this.maquina.cerrarSesionAbierta(tx, seccion.id, ahora);
        const apertura = await this.maquina.abrirSesion(tx, seccion, maxNumero + 1);

        return { sesion: apertura.sesion, eventos: [...cierre.eventos, ...apertura.eventos] };
      });
    } catch (error) {
      throw traducirCarreraDeNumero(error);
    }

    await this.eventos.publicarTodos(resultado.eventos);

    return sesionADto(resultado.sesion);
  }

  /** POST /session/secciones/:id/sesiones/:sesionId/forzar-cierre — ambos modos. */
  async forzarCierre(
    tenant: TenantContext,
    seccionId: string,
    sesionId: string
  ): Promise<SesionDto> {
    await this.buscarSeccionAccesible(seccionId);

    const sesion = await this.prisma.client.sesion.findFirst({
      where: { id: sesionId, seccionId },
    });

    if (!sesion) {
      throw new NotFoundException('Sesión no encontrada');
    }

    if (sesion.estado !== EstadoSesion.ABIERTA) {
      throw new ConflictException('La sesión ya está cerrada');
    }

    const ahora = new Date();

    await this.prisma.client.sesion.updateMany({
      where: { id: sesionId },
      data: { estado: EstadoSesion.CERRADA, fechaFin: ahora },
    });

    const cerrada: Sesion = { ...sesion, estado: EstadoSesion.CERRADA, fechaFin: ahora };

    await this.eventos.publicar(
      eventoDeSesion('SesionCerrada', ROUTING_KEYS.SESION_CERRADA, cerrada)
    );

    return sesionADto(cerrada);
  }

  /**
   * POST /session/sesiones/:id/extender — pospone el autocierre automático:
   * el nuevo límite es (extensión previa, o el próximo autocierre por cron en
   * la timezone del Grupo, o "ahora" si no hay autocierre programado) +
   * minutosAdicionales. El scheduler no cierra la sesión antes de ese
   * instante. En modo MANUAL no hay autocierre, así que solo deja constancia
   * (spec: "relevante solo en modo automático").
   */
  async extender(
    tenant: TenantContext,
    sesionId: string,
    datos: ExtenderSesionRequest
  ): Promise<SesionDto> {
    const sesion = await this.prisma.client.sesion.findFirst({ where: { id: sesionId } });

    if (!sesion) {
      throw new NotFoundException('Sesión no encontrada');
    }

    if (sesion.estado !== EstadoSesion.ABIERTA) {
      throw new ConflictException('Solo se puede extender una sesión abierta');
    }

    const config = await this.configuracion.efectiva(sesion.grupoId);
    const ahora = new Date();
    const base = sesion.autocierrePospuestoHasta ?? (await this.proximoAutocierre(sesion, config, ahora));
    const hasta = new Date(base.getTime() + datos.minutosAdicionales * 60000);

    await this.prisma.client.sesion.updateMany({
      where: { id: sesionId },
      data: { autocierrePospuestoHasta: hasta },
    });

    return sesionADto({ ...sesion, autocierrePospuestoHasta: hasta });
  }

  /** POST /session/secciones/:id/forzar-evaluacion — ABIERTA → EVALUACION. */
  async forzarEvaluacion(tenant: TenantContext, seccionId: string): Promise<SeccionDto> {
    const seccion = await this.buscarSeccionAccesible(seccionId);

    if (seccion.estado !== EstadoSeccion.ABIERTA) {
      throw new ConflictException('Solo una sección ABIERTA puede forzarse a evaluación');
    }

    const ahora = new Date();

    const transicion = await this.prisma.client.$transaction(async (tx) => {
      return await this.maquina.entrarEvaluacion(tx, seccion, ahora);
    });

    await this.eventos.publicarTodos(transicion.eventos);

    return seccionADto({ ...seccion, estado: EstadoSeccion.EVALUACION });
  }

  /**
   * POST /session/secciones/:id/cerrar — fuerza a CERRADA desde EVALUACION (o
   * desde ABIERTA en emergencia). Si modo=AUTOMATICO se crea la siguiente
   * Sección + primera Sesión en la misma operación (spec).
   */
  async cerrar(tenant: TenantContext, seccionId: string): Promise<SeccionDto> {
    const seccion = await this.buscarSeccionAccesible(seccionId);

    if (seccion.estado === EstadoSeccion.CERRADA) {
      throw new ConflictException('La sección ya está cerrada');
    }

    const config = await this.configuracion.efectiva(seccion.grupoId);
    const ahora = new Date();

    let transicion: { eventos: EventoSesiones[] };

    try {
      transicion = await this.prisma.client.$transaction(async (tx) => {
        return await this.maquina.cerrarSeccion(tx, seccion, config, ahora);
      });
    } catch (error) {
      throw traducirCarreraDeNumero(error);
    }

    await this.eventos.publicarTodos(transicion.eventos);

    return seccionADto({ ...seccion, estado: EstadoSeccion.CERRADA, fechaFin: ahora });
  }

  /**
   * Sección no-CERRADA más reciente del grupo con sus sesiones, o null.
   * Compartido con el endpoint interno (sin tenant, filtra por grupoId
   * explícito — el aislamiento del caso público lo da la tenant extension).
   */
  async buscarActual(grupoId: string): Promise<SeccionConSesionesResponse | null> {
    const seccion = (await this.prisma.client.seccion.findFirst({
      where: { grupoId, estado: { not: EstadoSeccion.CERRADA } },
      orderBy: { numero: 'desc' },
      include: { sesiones: { orderBy: { numero: 'asc' } } },
    })) as SeccionConSesiones | null;

    return seccion ? aResponseConSesiones(seccion) : null;
  }

  /**
   * Fila accesible para el tenant (el filtro automático agrega organizacionId
   * y, para TUTOR/USUARIO, grupoId IN grupoIds) — 404 si no existe o no es
   * suya. No hace falta REST a identity: la fila ya trae el grupo/organización
   * contra los que el filtro compara.
   */
  private async buscarSeccionAccesible(id: string): Promise<Seccion> {
    const seccion = await this.prisma.client.seccion.findFirst({ where: { id } });

    if (!seccion) {
      throw new NotFoundException('Sección no encontrada');
    }

    return seccion;
  }

  /**
   * Próximo autocierre "natural" de una sesión: la próxima ocurrencia de
   * cronSesion en la timezone del Grupo (modo AUTOMATICO). Sin cron o en
   * MANUAL, el autocierre no existe: se toma "ahora" como base.
   */
  private async proximoAutocierre(
    sesion: Sesion,
    config: ConfiguracionEfectiva,
    ahora: Date
  ): Promise<Date> {
    if (config.modo !== ModoSesion.AUTOMATICO || !config.cronAperturaSesion) {
      return ahora;
    }

    const grupo = await this.identity.obtenerGrupo(sesion.grupoId);

    if (!grupo) {
      return ahora;
    }

    return proximaOcurrencia(config.cronAperturaSesion, ahora, grupo.timezone) ?? ahora;
  }
}

/**
 * Una violación de `@@unique([grupoId|seccionId, numero])` en una carrera de
 * creación concurrente se traduce a 409 (mismo criterio duck-typed que
 * identity fase-02 con P2002).
 */
function traducirCarreraDeNumero(error: unknown): Error {
  const codigo = (error as { code?: string })?.code;

  if (codigo === 'P2002') {
    return new ConflictException(
      'Otra operación creó una Sección/Sesión en simultáneo — reintentá'
    );
  }

  return error as Error;
}

function aResponseConSesiones(seccion: SeccionConSesiones): SeccionConSesionesResponse {
  return { ...seccionADto(seccion), sesiones: seccion.sesiones.map(sesionADto) };
}
