import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import {
  ROUTING_KEYS,
  TareaEquipoCompletadaPayload,
  TareaEquipoMarcaPayload,
} from '@dorado/shared-events';
import {
  AsignacionPuntosEquipoDto,
  CompletarTareaEquipoResponse,
  EquipoInternoDto,
  EstadoSeccion,
  EstadoSesion,
  RegistroTareaEquipoDto,
  Rol,
  TareaEquipoDeHoyDto,
  TenantContext,
} from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import type { SeccionActualInterna } from '../clientes/session-client.service';
import { SessionClientService } from '../clientes/session-client.service';
import {
  ActividadNoDisponibleHoyException,
  EquipoNoEncontradoException,
  excepcionSiNoDisponible,
  LimiteRepeticionesAlcanzadoException,
  MarcaNoReversibleException,
  NoEsTareaDeEquipoException,
  NoHaySesionAbiertaException,
  SoloJefeCompletaTareaEquipoException,
} from '../comun/excepciones';
import { estaDisponibleEn, tieneProgramacion } from '../comun/programacion';
import { resolverSesionAbierta } from '../comun/sesion-abierta';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Actividad, RegistroTareaEquipo } from '../generated/prisma/client';
import { AlcanceActividad, EstadoCatalogo } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * La Sesión abierta si la hay, sin lanzar. `tareasDeHoy` es una LECTURA: sin
 * Sesión abierta devuelve los contadores en 0, no un 409 (mismo criterio que
 * `mi-estado-hoy`). Las escrituras siguen usando `resolverSesionAbierta`.
 */
function buscarSesionAbierta(
  seccion: SeccionActualInterna | null
): { sesionId: string; fechaInicioSesion: Date } | null {
  if (seccion?.estado !== EstadoSeccion.ABIERTA) {
    return null;
  }

  const abierta = seccion.sesiones.find((sesion) => sesion.estado === EstadoSesion.ABIERTA);

  return abierta
    ? { sesionId: abierta.id, fechaInicioSesion: new Date(abierta.fechaInicio) }
    : null;
}

function registroTareaEquipoADto(registro: RegistroTareaEquipo): RegistroTareaEquipoDto {
  return {
    registroTareaEquipoId: registro.id,
    eliminado: registro.eliminado,
    motivoTutor: registro.motivoTutor,
    completadaEn: registro.createdAt.toISOString(),
  };
}

/** El motivo de la anulación más reciente que tenga uno (fase-14-13). */
function ultimoMotivoDeAnulacion(anulados: RegistroTareaEquipo[]): string | null {
  const conMotivo = anulados
    .filter((registro) => registro.motivoTutor !== null)
    .sort(
      (a, b) => (b.eliminadoEn?.getTime() ?? 0) - (a.eliminadoEn?.getTime() ?? 0)
    );

  return conMotivo[0]?.motivoTutor ?? null;
}

@Injectable()
export class TareasEquipoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityClientService,
    private readonly session: SessionClientService,
    private readonly eventos: EventosPublisherService
  ) {}

  /**
   * POST /activity/equipos/:equipoId/tareas/:actividadId/completar. La completa
   * el jefe del equipo (o un Tutor del grupo); scoring reparte los puntos a cada
   * miembro (base) + bono al jefe (fase-14-09, decisiones 8/9/10).
   */
  async completar(
    tenant: TenantContext,
    equipoId: string,
    actividadId: string
  ): Promise<CompletarTareaEquipoResponse> {
    const equipo = await this.resolverEquipo(tenant, equipoId);

    this.asegurarPuedeCompletar(tenant, equipo);

    const actividad = await this.buscarTareaEquipo(actividadId, equipo.grupoId);
    const seccion = await this.session.obtenerSeccionActual(equipo.grupoId);
    const sesion = resolverSesionAbierta(seccion);

    // fase-14-11 + fase-14-24: una tarea de equipo también puede estar
    // programada por días o acotada por fechas. El cruce REST para resolver la
    // timezone se paga solo si tiene alguna de las dos (patrón del ítem 11).
    if (tieneProgramacion(actividad)) {
      const grupo = await this.identity.obtenerGrupo(equipo.grupoId);

      if (!grupo) {
        throw new ActividadNoDisponibleHoyException(actividad.diasSemana);
      }

      // El motivo decide cuál de las dos excepciones sale.
      const noDisponible = excepcionSiNoDisponible(
        actividad,
        sesion.fechaInicioSesion,
        grupo.timezone
      );

      if (noDisponible) {
        throw noDisponible;
      }
    }

    // Sin `eliminado: false` a propósito (fase-14-13, decisión 5): una
    // completada que el Tutor anuló es un intento GASTADO del equipo, no un
    // intento devuelto. `tareasDeHoy` expone el mismo número como `topeEfectivo`
    // para que el botón del jefe no prometa algo que el servidor va a rechazar.
    const intentosUsados = await this.prisma.client.registroTareaEquipo.count({
      where: { equipoId, actividadId, sesionId: sesion.sesionId },
    });

    if (intentosUsados >= actividad.repeticionesMaximasSesion) {
      throw new LimiteRepeticionesAlcanzadoException();
    }

    const asignaciones: AsignacionPuntosEquipoDto[] = equipo.miembros.map((miembro) => {
      const esJefe = miembro.usuarioId === equipo.jefeUsuarioId;

      return {
        usuarioId: miembro.usuarioId,
        esJefe,
        puntos: actividad.valorPuntos + (esJefe ? actividad.bonoJefePuntos : 0),
      };
    });

    const registro = await this.prisma.client.registroTareaEquipo.create({
      data: {
        organizacionId: tenant.organizacionId,
        grupoId: equipo.grupoId,
        equipoId,
        actividadId,
        sesionId: sesion.sesionId,
        seccionId: sesion.seccionId,
        valorPuntosSnapshot: actividad.valorPuntos,
        bonoJefeSnapshot: actividad.bonoJefePuntos,
        jefeUsuarioIdSnapshot: equipo.jefeUsuarioId,
        // snapshot de auditoría; el tipo Json de Prisma no acepta la interfaz directo.
        miembrosSnapshot: asignaciones as unknown as object,
        completadaPorId: tenant.principalId,
        completadaPorTipo: tenant.rol === Rol.USUARIO ? 'USUARIO' : 'TUTOR',
      },
    });

    await this.eventos.publicar<TareaEquipoCompletadaPayload>({
      eventType: 'TareaEquipoCompletada',
      routingKey: ROUTING_KEYS.TAREA_EQUIPO_COMPLETADA,
      organizacionId: tenant.organizacionId,
      grupoId: equipo.grupoId,
      payload: {
        registroTareaEquipoId: registro.id,
        actividadId,
        equipoId,
        organizacionId: tenant.organizacionId,
        grupoId: equipo.grupoId,
        sesionId: sesion.sesionId,
        seccionId: sesion.seccionId,
        completadaPorId: tenant.principalId,
        completadaPorTipo: tenant.rol === Rol.USUARIO ? 'USUARIO' : 'TUTOR',
        asignaciones,
      },
    });

    return {
      registroTareaEquipoId: registro.id,
      equipoId,
      actividadId,
      asignaciones,
    };
  }

  /**
   * GET /activity/equipos/:equipoId/tareas-de-hoy — miembros del equipo y
   * Tutores. Estado de cada tarea de equipo ACTIVA del grupo en la Sesión
   * abierta (fase-14-13): cuántas hechas, cuántas anuladas y el tope real.
   * Sin Sesión abierta devuelve las tareas con los contadores en 0 — no es un
   * error (mismo criterio que `mi-estado-hoy`).
   */
  async tareasDeHoy(
    tenant: TenantContext,
    equipoId: string
  ): Promise<TareaEquipoDeHoyDto[]> {
    const equipo = await this.resolverEquipo(tenant, equipoId);

    this.asegurarPuedeVer(tenant, equipo);

    const tareas = await this.prisma.client.actividad.findMany({
      where: {
        grupoId: equipo.grupoId,
        estado: EstadoCatalogo.ACTIVA,
        alcance: AlcanceActividad.EQUIPO,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (tareas.length === 0) {
      return [];
    }

    const seccion = await this.session.obtenerSeccionActual(equipo.grupoId);
    const sesion = buscarSesionAbierta(seccion);
    const registros = sesion
      ? await this.prisma.client.registroTareaEquipo.findMany({
          where: { equipoId, sesionId: sesion.sesionId },
        })
      : [];

    // fase-14-11: la timezone se pide UNA vez y solo si hay alguna programada.
    const hayProgramadas = tareas.some(tieneProgramacion);
    const timezone =
      hayProgramadas && sesion
        ? (await this.identity.obtenerGrupo(equipo.grupoId))?.timezone
        : undefined;

    // El USUARIO ve el estado agregado, no los ids con los que se anula: esas
    // filas son la herramienta del Tutor (mismo criterio que `MarcaRojaDto`).
    const esTutor = tenant.rol === Rol.TUTOR || tenant.rol === Rol.ORG_ADMIN;

    return tareas.map((tarea) => {
      const suyos = registros.filter((registro) => registro.actividadId === tarea.id);
      const anulados = suyos.filter((registro) => registro.eliminado);

      return {
        actividadId: tarea.id,
        nombre: tarea.nombre,
        valorPuntos: tarea.valorPuntos,
        bonoJefePuntos: tarea.bonoJefePuntos,
        repeticionesMaximasSesion: tarea.repeticionesMaximasSesion,
        vecesHechas: suyos.length - anulados.length,
        vecesAnuladas: anulados.length,
        topeEfectivo: Math.max(0, tarea.repeticionesMaximasSesion - anulados.length),
        motivoTutor: ultimoMotivoDeAnulacion(anulados),
        disponibleHoy:
          timezone && sesion
            ? estaDisponibleEn(tarea, sesion.fechaInicioSesion, timezone)
            : true,
        diasSemana: tarea.diasSemana,
        registros: esTutor ? suyos.map(registroTareaEquipoADto) : [],
      };
    });
  }

  /**
   * DELETE /activity/registros-tarea-equipo/:id — Tutor. Anula la completada:
   * todos los que recibieron puntos por ella los pierden, bono del jefe
   * incluido (fase-14-13, decisiones 1 y 2). scoring compensa vía evento.
   */
  async anular(
    tenant: TenantContext,
    registroId: string,
    motivo?: string
  ): Promise<RegistroTareaEquipoDto> {
    const registro = await this.buscarRegistroDeLaSesion(tenant, registroId);

    if (registro.eliminado) {
      throw new ConflictException('La tarea de equipo ya fue anulada');
    }

    const ahora = new Date();
    const cambios = {
      eliminado: true,
      eliminadoPorTutorId: tenant.principalId,
      eliminadoEn: ahora,
      motivoTutor: motivo ?? null,
    };

    await this.prisma.client.registroTareaEquipo.updateMany({
      where: { id: registroId },
      data: cambios,
    });

    await this.publicarMarca(
      'TareaEquipoAnulada',
      ROUTING_KEYS.TAREA_EQUIPO_ANULADA,
      registro,
      tenant.principalId
    );

    return registroTareaEquipoADto({ ...registro, ...cambios });
  }

  /**
   * POST /activity/registros-tarea-equipo/:id/revertir — Tutor. Deshace la
   * anulación y le devuelve el reparto completo al equipo. Igual que en el
   * ítem 12, NO se limpian `eliminadoPorTutorId`/`eliminadoEn`: la fila
   * conserva la historia entera.
   */
  async revertirAnulacion(
    tenant: TenantContext,
    registroId: string
  ): Promise<RegistroTareaEquipoDto> {
    const registro = await this.buscarRegistroDeLaSesion(tenant, registroId);

    if (!registro.eliminado) {
      throw new MarcaNoReversibleException();
    }

    const ahora = new Date();
    const cambios = {
      eliminado: false,
      revertidoPorTutorId: tenant.principalId,
      revertidoEn: ahora,
    };

    await this.prisma.client.registroTareaEquipo.updateMany({
      where: { id: registroId },
      data: cambios,
    });

    await this.publicarMarca(
      'TareaEquipoRevertida',
      ROUTING_KEYS.TAREA_EQUIPO_REVERTIDA,
      registro,
      tenant.principalId
    );

    return registroTareaEquipoADto({ ...registro, ...cambios });
  }

  /**
   * La completada sobre la que opera el Tutor: de su organización y de la
   * Sesión abierta. La marca vive dentro de su Sesión (fase-14-12, decisión 4):
   * una vez cerrada, lo registrado queda como quedó.
   */
  private async buscarRegistroDeLaSesion(
    tenant: TenantContext,
    registroId: string
  ): Promise<RegistroTareaEquipo> {
    const registro = await this.prisma.client.registroTareaEquipo.findFirst({
      where: { id: registroId },
    });

    // Mismo 404 para inexistente y para "de otra organización": no revela nada.
    if (!registro || registro.organizacionId !== tenant.organizacionId) {
      throw new NotFoundException('Tarea de equipo no encontrada');
    }

    const seccion = await this.session.obtenerSeccionActual(registro.grupoId);
    const sesion = resolverSesionAbierta(seccion);

    if (registro.sesionId !== sesion.sesionId) {
      throw new NoHaySesionAbiertaException();
    }

    return registro;
  }

  /** Anular y deshacer publican el mismo payload; scoring hace lo mismo con los dos. */
  private async publicarMarca(
    eventType: string,
    routingKey: string,
    registro: RegistroTareaEquipo,
    tutorId: string
  ): Promise<void> {
    await this.eventos.publicar<TareaEquipoMarcaPayload>({
      eventType,
      routingKey,
      organizacionId: registro.organizacionId,
      grupoId: registro.grupoId,
      payload: {
        registroTareaEquipoId: registro.id,
        equipoId: registro.equipoId,
        tutorId,
      },
    });
  }

  /** Equipo del tenant (misma organización), resuelto vía identity. */
  private async resolverEquipo(
    tenant: TenantContext,
    equipoId: string
  ): Promise<EquipoInternoDto> {
    const equipo = await this.identity.obtenerEquipo(equipoId);

    if (!equipo || equipo.organizacionId !== tenant.organizacionId) {
      throw new EquipoNoEncontradoException();
    }

    return equipo;
  }

  /** Autorización: el jefe del equipo, o un Tutor/ORG_ADMIN del grupo. */
  private asegurarPuedeCompletar(tenant: TenantContext, equipo: EquipoInternoDto): void {
    const esTutor = tenant.rol === Rol.TUTOR || tenant.rol === Rol.ORG_ADMIN;
    const esJefe = tenant.rol === Rol.USUARIO && tenant.principalId === equipo.jefeUsuarioId;

    if (!esTutor && !esJefe) {
      throw new SoloJefeCompletaTareaEquipoException();
    }
  }

  /**
   * Leer el estado de hoy lo puede hacer cualquier miembro (no solo el jefe):
   * la anulación le costó puntos a todo el equipo, así que todos tienen que
   * poder verla (fase-14-13, Parte C).
   */
  private asegurarPuedeVer(tenant: TenantContext, equipo: EquipoInternoDto): void {
    if (tenant.rol === Rol.TUTOR || tenant.rol === Rol.ORG_ADMIN) {
      return;
    }

    const esMiembro = equipo.miembros.some(
      (miembro) => miembro.usuarioId === tenant.principalId
    );

    if (!esMiembro) {
      throw new EquipoNoEncontradoException();
    }
  }

  private async buscarTareaEquipo(actividadId: string, grupoId: string): Promise<Actividad> {
    const actividad = await this.prisma.client.actividad.findFirst({
      where: { id: actividadId },
    });

    // Mismo 404 para inexistente / archivada / de otro grupo (no revela nada).
    if (!actividad || actividad.estado !== EstadoCatalogo.ACTIVA || actividad.grupoId !== grupoId) {
      throw new NotFoundException('Actividad no encontrada');
    }

    if (actividad.alcance !== AlcanceActividad.EQUIPO) {
      throw new NoEsTareaDeEquipoException();
    }

    return actividad;
  }
}
