import { Injectable, NotFoundException } from '@nestjs/common';

import { ROUTING_KEYS, TareaEquipoCompletadaPayload } from '@dorado/shared-events';
import {
  AsignacionPuntosEquipoDto,
  CompletarTareaEquipoResponse,
  EquipoInternoDto,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { SessionClientService } from '../clientes/session-client.service';
import {
  EquipoNoEncontradoException,
  LimiteRepeticionesAlcanzadoException,
  NoEsTareaDeEquipoException,
  SoloJefeCompletaTareaEquipoException,
} from '../comun/excepciones';
import { resolverSesionAbierta } from '../comun/sesion-abierta';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Actividad } from '../generated/prisma/client';
import { AlcanceActividad, EstadoCatalogo } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

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

    const hechas = await this.prisma.client.registroTareaEquipo.count({
      where: { equipoId, actividadId, sesionId: sesion.sesionId },
    });

    if (hechas >= actividad.repeticionesMaximasSesion) {
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
