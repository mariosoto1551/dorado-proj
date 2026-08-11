import { Injectable, NotFoundException } from '@nestjs/common';

import {
  AsignacionTurnoDto,
  AvisoPosicionTurno,
  FrecuenciaTurno,
  PosicionTurnoDto,
  TenantContext,
  TurnoActividadDto,
  TurnoDeHoyDelGrupoDto,
} from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { SessionClientService } from '../clientes/session-client.service';
import { AccesoGrupoService } from '../comun/acceso-grupo.service';
import {
  SecuenciaVaciaException,
  SinTurnoVigenteException,
  TurnoFueraDelDestinatarioException,
  TurnoNoConfiguradoException,
  TurnoSoloIndividualException,
  TurnoSoloObligatoriaException,
  UsuarioNoEsDelGrupoException,
} from '../comun/excepciones';
import { resolverSesionAbierta } from '../comun/sesion-abierta';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Actividad, AsignacionTurno, TurnoActividad } from '../generated/prisma/client';
import {
  AlcanceActividad,
  EstadoCatalogo,
  FrecuenciaTurno as FrecuenciaPrisma,
  ModoTurno as ModoPrisma,
  TipoPuntaje,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { ConfigurarTurnoRequest, ReasignarTurnoRequest } from './dto/turnos.dto';

/** Turno con su secuencia, tal como sale de la base. */
type TurnoConPosiciones = TurnoActividad & {
  posiciones: Array<{ orden: number; usuarioId: string }>;
};

/**
 * Configuración y consulta de los turnos rotativos (spec fase-14-21).
 *
 * El **sellado** (quién recibe el turno de hoy) NO vive acá: vive en
 * `SelladoTurnosService`, porque corre desde un consumidor de eventos y no
 * desde un request con JWT. Acá está lo que el Tutor toca a mano.
 */
@Injectable()
export class TurnosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoGrupoService,
    private readonly identity: IdentityClientService,
    private readonly session: SessionClientService,
    private readonly eventos: EventosPublisherService
  ) {}

  /** GET /activity/actividades/:id/turno — TUTOR/ORG_ADMIN. */
  async obtener(tenant: TenantContext, actividadId: string): Promise<TurnoActividadDto> {
    const actividad = await this.buscarActividad(actividadId);

    this.acceso.asegurarAccesoLectura(tenant, actividad.grupoId);

    const turno = await this.cargarTurno(actividadId);

    if (!turno) {
      throw new TurnoNoConfiguradoException();
    }

    return await this.construirDto(actividad, turno);
  }

  /**
   * PUT /activity/actividades/:id/turno — crea o reemplaza la secuencia.
   *
   * **No toca la vuelta en curso** (decisión 15): la permutación ya sellada se
   * respeta y la secuencia nueva entra en la vuelta siguiente. Eso es lo que
   * hace que editar la lista a mitad de semana no le cambie el día a nadie que
   * ya lo tenía asignado.
   */
  async configurar(
    tenant: TenantContext,
    actividadId: string,
    datos: ConfigurarTurnoRequest
  ): Promise<TurnoActividadDto> {
    const actividad = await this.buscarActividad(actividadId);

    await this.acceso.asegurarAccesoEscritura(tenant, actividad.grupoId);
    this.asegurarActividadRotable(actividad);

    if (datos.posiciones.length === 0) {
      throw new SecuenciaVaciaException();
    }

    // Todos tienen que ser del grupo AL GUARDAR. Después pueden irse, y ahí
    // manda la decisión 14: la lista no se edita sola, se saltea al sellar.
    const usuarios = await this.identity.usuariosDelGrupo(actividad.grupoId);
    const idsDelGrupo = new Set(usuarios.map((usuario) => usuario.id));

    if (datos.posiciones.some((posicion) => !idsDelGrupo.has(posicion.usuarioId))) {
      throw new UsuarioNoEsDelGrupoException();
    }

    // fase-14-24, decisión 6: si la actividad tiene destinatario nominal, el
    // pozo sale de ahí. Una sola verdad sobre quién participa — cargar en la
    // rotación a alguien que no es destinatario le daría un turno que su
    // pantalla nunca le va a mostrar, y el castigo caería igual.
    if (
      actividad.usuariosPermitidos.length > 0 &&
      datos.posiciones.some(
        (posicion) => !actividad.usuariosPermitidos.includes(posicion.usuarioId)
      )
    ) {
      throw new TurnoFueraDelDestinatarioException();
    }

    const turno = await this.prisma.client.$transaction(async (tx) => {
      const existente = await tx.turnoActividad.findFirst({ where: { actividadId } });

      const fila = existente
        ? await tx.turnoActividad.update({
            where: { id: existente.id },
            data: {
              modo: datos.modo as ModoPrisma,
              frecuencia: datos.frecuencia as FrecuenciaPrisma,
              activo: datos.activo ?? true,
            },
          })
        : await tx.turnoActividad.create({
            data: {
              organizacionId: tenant.organizacionId,
              grupoId: actividad.grupoId,
              actividadId,
              modo: datos.modo as ModoPrisma,
              frecuencia: datos.frecuencia as FrecuenciaPrisma,
              activo: datos.activo ?? true,
            },
          });

      // La secuencia se reemplaza entera: es una lista ordenada, y un diff
      // posición por posición no aportaría nada (no hay nada colgando de una
      // PosicionTurno — las vueltas ya selladas guardan su propia copia).
      await tx.posicionTurno.deleteMany({ where: { turnoActividadId: fila.id } });
      await tx.posicionTurno.createMany({
        data: datos.posiciones.map((posicion, indice) => ({
          turnoActividadId: fila.id,
          orden: indice,
          usuarioId: posicion.usuarioId,
        })),
      });

      return fila;
    });

    await this.publicarAccion(tenant, actividad, 'TURNO_CONFIGURADO', {
      modo: datos.modo,
      frecuencia: datos.frecuencia,
      posiciones: datos.posiciones.map((posicion) => posicion.usuarioId),
    });

    const cargado = await this.cargarTurno(actividadId);

    return await this.construirDto(actividad, cargado ?? { ...turno, posiciones: [] });
  }

  /**
   * DELETE /activity/actividades/:id/turno — apaga la rotación.
   *
   * `activo = false`, sin borrar: la obligatoria vuelve a ser de todos, pero el
   * historial de a quién le tocó qué día se conserva (es lo que explica los
   * castigos ya aplicados).
   */
  async apagar(tenant: TenantContext, actividadId: string): Promise<void> {
    const actividad = await this.buscarActividad(actividadId);

    await this.acceso.asegurarAccesoEscritura(tenant, actividad.grupoId);

    const turno = await this.prisma.client.turnoActividad.findFirst({ where: { actividadId } });

    if (!turno) {
      throw new TurnoNoConfiguradoException();
    }

    await this.prisma.client.turnoActividad.update({
      where: { id: turno.id },
      data: { activo: false },
    });

    await this.publicarAccion(tenant, actividad, 'TURNO_APAGADO', {});
  }

  /**
   * POST /activity/actividades/:id/turno/reasignar — el Tutor cambia el turno
   * del ámbito vigente (decisión 8). Deja el rastro de quién lo hizo y a quién
   * le tocaba (decisión 16): la fila es estado operativo, pero su historia no
   * se pierde.
   */
  async reasignar(
    tenant: TenantContext,
    actividadId: string,
    datos: ReasignarTurnoRequest
  ): Promise<AsignacionTurnoDto> {
    const actividad = await this.buscarActividad(actividadId);

    await this.acceso.asegurarAccesoEscritura(tenant, actividad.grupoId);

    const vigente = await this.asignacionVigente(actividad);

    if (!vigente) {
      throw new SinTurnoVigenteException();
    }

    const usuarios = await this.identity.usuariosDelGrupo(actividad.grupoId);

    if (!usuarios.some((usuario) => usuario.id === datos.usuarioId)) {
      throw new UsuarioNoEsDelGrupoException();
    }

    const actualizada = await this.prisma.client.asignacionTurno.update({
      where: { id: vigente.id },
      data: {
        usuarioId: datos.usuarioId,
        // Solo la PRIMERA reasignación fija el original: si el tutor cambia dos
        // veces, "a quién le tocaba" sigue siendo el del sorteo, no el paso
        // intermedio.
        usuarioOriginalId: vigente.usuarioOriginalId ?? vigente.usuarioId,
        reasignadoPorTutorId: tenant.principalId,
        reasignadoEn: new Date(),
        motivoReasignacion: datos.motivo ?? null,
      },
    });

    await this.publicarAccion(tenant, actividad, 'TURNO_REASIGNADO', {
      de: actualizada.usuarioOriginalId,
      a: datos.usuarioId,
      motivo: datos.motivo ?? null,
    });

    return this.asignacionADto(actualizada, this.nombresDe(usuarios));
  }

  /** GET /activity/grupos/:grupoId/turnos-de-hoy — panel del Tutor. */
  async turnosDeHoy(
    tenant: TenantContext,
    grupoId: string
  ): Promise<TurnoDeHoyDelGrupoDto[]> {
    this.acceso.asegurarAccesoLectura(tenant, grupoId);

    const turnos = await this.prisma.client.turnoActividad.findMany({
      where: { grupoId, activo: true },
    });

    if (turnos.length === 0) {
      return [];
    }

    const actividades = await this.prisma.client.actividad.findMany({
      where: { id: { in: turnos.map((turno) => turno.actividadId) } },
    });
    const porId = new Map(actividades.map((actividad) => [actividad.id, actividad]));

    const usuarios = await this.identity.usuariosDelGrupo(grupoId);
    const nombres = this.nombresDe(usuarios);

    const filas: TurnoDeHoyDelGrupoDto[] = [];

    for (const turno of turnos) {
      const actividad = porId.get(turno.actividadId);

      if (!actividad) {
        continue;
      }

      const vigente = await this.asignacionVigente(actividad);

      filas.push({
        actividadId: actividad.id,
        actividadNombre: actividad.nombre,
        frecuencia: turno.frecuencia as FrecuenciaTurno,
        asignacion: vigente ? this.asignacionADto(vigente, nombres) : null,
      });
    }

    return filas;
  }

  /**
   * ¿La actividad rota? Consulta local y barata, pensada para el camino caliente
   * del registro: si devuelve false no hace falta resolver Sesión ni asignación,
   * que es el caso de toda actividad anterior a este ítem.
   */
  async tieneTurnoActivo(actividadId: string): Promise<boolean> {
    const turno = await this.prisma.client.turnoActividad.findFirst({
      where: { actividadId, activo: true },
      select: { id: true },
    });

    return turno !== null;
  }

  /**
   * La asignación del ámbito vigente (la Sesión abierta, o su Sección si la
   * frecuencia es semanal). `null` si no hay Sesión abierta o si hoy no se
   * selló turno — que es un estado normal, no un error (decisiones 9 y 19).
   *
   * fase-14-33: `ambito` permite preguntar por **otra** Sesión de la Sección
   * vigente. Es el mismo turno sellado que se guardó ese día: la asignación ya
   * vive por `ambitoId`, así que esto no reconstruye nada — lee la fila que
   * corresponde. Sin `ambito` resuelve la Sesión abierta, igual que siempre.
   */
  async asignacionVigente(
    actividad: Actividad,
    ambito?: { sesionId: string; seccionId: string }
  ): Promise<AsignacionTurno | null> {
    const turno = await this.prisma.client.turnoActividad.findFirst({
      where: { actividadId: actividad.id, activo: true },
    });

    if (!turno) {
      return null;
    }

    let sesion: { sesionId: string; seccionId: string };

    if (ambito) {
      sesion = ambito;
    } else {
      const seccion = await this.session.obtenerSeccionActual(actividad.grupoId);

      try {
        sesion = resolverSesionAbierta(seccion);
      } catch {
        // Sin Sesión abierta no hay turno vigente; no es un error de este flujo.
        return null;
      }
    }

    const ambitoId =
      turno.frecuencia === FrecuenciaPrisma.SECCION ? sesion.seccionId : sesion.sesionId;

    return await this.prisma.client.asignacionTurno.findFirst({
      where: { actividadId: actividad.id, ambitoId },
    });
  }

  // --- helpers ---

  private async buscarActividad(actividadId: string): Promise<Actividad> {
    const actividad = await this.prisma.client.actividad.findFirst({
      where: { id: actividadId, estado: EstadoCatalogo.ACTIVA },
    });

    if (!actividad) {
      throw new NotFoundException('Actividad no encontrada');
    }

    return actividad;
  }

  private asegurarActividadRotable(actividad: Actividad): void {
    if (actividad.tipoPuntaje !== TipoPuntaje.OBLIGATORIA) {
      throw new TurnoSoloObligatoriaException();
    }

    if (actividad.alcance !== AlcanceActividad.INDIVIDUAL) {
      throw new TurnoSoloIndividualException();
    }
  }

  private async cargarTurno(actividadId: string): Promise<TurnoConPosiciones | null> {
    return await this.prisma.client.turnoActividad.findFirst({
      where: { actividadId },
      include: { posiciones: { orderBy: { orden: 'asc' } } },
    });
  }

  private nombresDe(
    usuarios: Array<{ id: string; nombre: string }>
  ): Map<string, string> {
    return new Map(usuarios.map((usuario) => [usuario.id, usuario.nombre]));
  }

  private asignacionADto(
    asignacion: AsignacionTurno,
    nombres: Map<string, string>
  ): AsignacionTurnoDto {
    return {
      actividadId: asignacion.actividadId,
      usuarioId: asignacion.usuarioId,
      nombre: nombres.get(asignacion.usuarioId) ?? '',
      vueltaNumero: asignacion.vueltaNumero,
      indice: asignacion.indice,
      usuarioOriginalId: asignacion.usuarioOriginalId,
      nombreOriginal: asignacion.usuarioOriginalId
        ? (nombres.get(asignacion.usuarioOriginalId) ?? '')
        : null,
      reasignadoEn: asignacion.reasignadoEn?.toISOString() ?? null,
      motivoReasignacion: asignacion.motivoReasignacion,
    };
  }

  /**
   * Arma el DTO con los avisos por posición: quién ya no está en el grupo y
   * quién perdió el rol que la actividad exige. El Tutor tiene que poder ver
   * eso ANTES de que el sistema saltee ese turno en silencio (decisión 14).
   */
  private async construirDto(
    actividad: Actividad,
    turno: TurnoConPosiciones
  ): Promise<TurnoActividadDto> {
    const usuarios = await this.identity.usuariosDelGrupo(actividad.grupoId);
    const nombres = this.nombresDe(usuarios);
    const idsDelGrupo = new Set(usuarios.map((usuario) => usuario.id));

    // El rol solo se consulta si la actividad está restringida (fase-14-19).
    const conRol = new Set<string>();

    if (actividad.rolesPermitidos.length > 0) {
      const asignados = await this.identity.rolesAsignados(actividad.grupoId);

      for (const fila of asignados) {
        if (fila.rolGrupoId && actividad.rolesPermitidos.includes(fila.rolGrupoId)) {
          conRol.add(fila.usuarioId);
        }
      }
    }

    const posiciones: PosicionTurnoDto[] = turno.posiciones.map((posicion) => ({
      orden: posicion.orden,
      usuarioId: posicion.usuarioId,
      nombre: nombres.get(posicion.usuarioId) ?? '',
      aviso: !idsDelGrupo.has(posicion.usuarioId)
        ? AvisoPosicionTurno.YA_NO_ESTA_EN_EL_GRUPO
        : actividad.rolesPermitidos.length > 0 && !conRol.has(posicion.usuarioId)
          ? AvisoPosicionTurno.SIN_EL_ROL
          : null,
    }));

    const vigente = await this.asignacionVigente(actividad);
    const vuelta = vigente
      ? await this.prisma.client.vueltaTurno.findFirst({
          where: { turnoActividadId: turno.id, numero: vigente.vueltaNumero },
        })
      : null;

    // Lo que resta de la vuelta ya sellada. Es una PREVISIÓN: si alguien se va
    // antes de su día, ese turno se saltea al sellarlo.
    const proximos = vuelta
      ? vuelta.ordenUsuarioIds.slice(vigente!.indice + 1).map((usuarioId) => ({
          usuarioId,
          nombre: nombres.get(usuarioId) ?? '',
        }))
      : [];

    return {
      actividadId: actividad.id,
      modo: turno.modo as TurnoActividadDto['modo'],
      frecuencia: turno.frecuencia as FrecuenciaTurno,
      activo: turno.activo,
      posiciones,
      asignacionVigente: vigente ? this.asignacionADto(vigente, nombres) : null,
      proximos,
    };
  }

  private async publicarAccion(
    tenant: TenantContext,
    actividad: Actividad,
    accion: string,
    detalle: Record<string, unknown>
  ): Promise<void> {
    await this.eventos.publicarAccionAdministrativa({
      organizacionId: tenant.organizacionId,
      grupoId: actividad.grupoId,
      actorId: tenant.principalId,
      actorTipo: tenant.principalType,
      accion,
      entidadTipo: 'TurnoActividad',
      entidadId: actividad.id,
      detalle,
    });
  }
}
