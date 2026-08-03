import { Injectable, Logger } from '@nestjs/common';

import type { EventEnvelope, SesionEventoPayload } from '@dorado/shared-events';

import { IdentityClientService } from '../clientes/identity-client.service';
import { estaDisponibleEn, tieneProgramacion } from '../comun/programacion';
import {
  type MotivoSalteo,
  sellarOrdenDeVuelta,
  siguienteTurno,
  vueltaAgotada,
} from '../comun/rotacion-turnos';
import type { Actividad } from '../generated/prisma/client';
import {
  EstadoCatalogo,
  FrecuenciaTurno,
  ModoTurno,
  TipoPuntaje,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/** Mismo identificador de consumidor que el castigo al cierre (fase-14-08). */
export const CONSUMIDOR = 'activity-service';

/**
 * Sella el turno del día al abrir una Sesión (spec fase-14-21, decisión 1).
 *
 * Por qué al abrir y no al vuelo: si el turno se derivara de una fórmula sobre
 * la fecha, cambiar la lista de integrantes reescribiría el pasado y sería
 * imposible auditar por qué se castigó a alguien. Sellado significa que queda
 * escrito quién tenía el turno ESE día, para siempre.
 *
 * Corre SIN contexto de tenant (sin JWT): filtra explícitamente por
 * organizacionId/grupoId del envelope, igual que el consumidor de cierre.
 * Idempotente vía `EventoProcesado` — importante por el #16, que puede abrir
 * varias sesiones seguidas al reconciliar una ventana perdida.
 */
@Injectable()
export class SelladoTurnosService {
  private readonly logger = new Logger(SelladoTurnosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityClientService
  ) {}

  async procesarSesionAbierta(envelope: EventEnvelope<SesionEventoPayload>): Promise<void> {
    if (await this.yaProcesado(envelope.eventId)) {
      return;
    }

    const { sesionId, seccionId, organizacionId, grupoId, fechaInicio } = envelope.payload;

    const turnos = await this.prisma.client.turnoActividad.findMany({
      where: { organizacionId, grupoId, activo: true },
    });

    // Un grupo sin turnos no paga nada: ni consultas de catálogo ni llamadas
    // internas. Igual hay que marcar el evento como procesado.
    if (turnos.length === 0) {
      await this.marcarProcesado(envelope.eventId);

      return;
    }

    const actividades = await this.prisma.client.actividad.findMany({
      where: {
        id: { in: turnos.map((turno) => turno.actividadId) },
        estado: EstadoCatalogo.ACTIVA,
        tipoPuntaje: TipoPuntaje.OBLIGATORIA,
      },
    });
    const porId = new Map(actividades.map((actividad) => [actividad.id, actividad]));

    // Dos llamadas internas por evento, no una por actividad ni por posición.
    const [usuarios, rolesAsignados, grupo] = await Promise.all([
      this.identity.usuariosDelGrupo(grupoId),
      this.identity.rolesAsignados(grupoId),
      this.identity.obtenerGrupo(grupoId),
    ]);

    const idsDelGrupo = new Set(usuarios.map((usuario) => usuario.id));
    const rolPorUsuario = new Map(
      rolesAsignados.map((fila) => [fila.usuarioId, fila.rolGrupoId])
    );

    for (const turno of turnos) {
      const actividad = porId.get(turno.actividadId);

      if (!actividad) {
        continue;
      }

      await this.sellarUno({
        turno,
        actividad,
        sesionId,
        seccionId,
        organizacionId,
        grupoId,
        fechaInicio,
        timezone: grupo?.timezone,
        idsDelGrupo,
        rolPorUsuario,
      });
    }

    await this.marcarProcesado(envelope.eventId);
  }

  /** El sellado de UNA actividad. Devuelve sin escribir si hoy no corresponde. */
  private async sellarUno(contexto: {
    turno: { id: string; modo: ModoTurno; frecuencia: FrecuenciaTurno };
    actividad: Actividad;
    sesionId: string;
    seccionId: string;
    organizacionId: string;
    grupoId: string;
    fechaInicio: string | undefined;
    timezone: string | undefined;
    idsDelGrupo: Set<string>;
    rolPorUsuario: Map<string, string | null>;
  }): Promise<void> {
    const { turno, actividad } = contexto;

    const ambitoId =
      turno.frecuencia === FrecuenciaTurno.SECCION ? contexto.seccionId : contexto.sesionId;

    // 1. Con frecuencia semanal, la 2ª Sesión de la Sección no vuelve a sellar
    //    ni avanza el turno (decisión 2).
    const yaSellado = await this.prisma.client.asignacionTurno.findFirst({
      where: { actividadId: actividad.id, ambitoId },
    });

    if (yaSellado) {
      return;
    }

    // 2. Un día en que la actividad no corre NO consume turno (decisión 9): al
    //    día siguiente le toca a quien le tocaba. Si falta el dato para
    //    decidirlo, no se sella — es preferible a repartir un turno equivocado.
    if (!this.correHoy(actividad, contexto.fechaInicio, contexto.timezone)) {
      return;
    }

    // 3. Vuelta vigente, o la siguiente si la anterior se consumió entera.
    const ultima = await this.prisma.client.asignacionTurno.findFirst({
      where: { actividadId: actividad.id },
      orderBy: [{ vueltaNumero: 'desc' }, { indice: 'desc' }],
    });

    const vuelta = await this.resolverVuelta(turno, ultima, contexto.organizacionId);

    if (!vuelta) {
      this.logger.warn(
        `Actividad ${actividad.id} tiene turnos activos pero la secuencia está vacía — no se sella`
      );

      return;
    }

    const desdeIndice = vuelta.esNueva ? 0 : (ultima?.indice ?? -1) + 1;

    // 4. Saltear posiciones inválidas (decisiones 14, 18 y 19).
    const avance = siguienteTurno(vuelta.ordenUsuarioIds, desdeIndice, (usuarioId) =>
      this.motivoDeSalteo(usuarioId, actividad, contexto.idsDelGrupo, contexto.rolPorUsuario)
    );

    for (const salteada of avance.salteadas) {
      this.logger.log(
        `Turno de ${actividad.id}: se saltea a ${salteada.usuarioId} (${salteada.motivo})`
      );
    }

    if (!avance.candidato) {
      // Ninguna posición quedó válida: hoy no le toca a nadie y no se castiga a
      // nadie. Mejor que elegir un reemplazante que el Tutor no decidió.
      this.logger.warn(
        `Actividad ${actividad.id}: ninguna posición de la vuelta ${vuelta.numero} puede recibir el turno — hoy queda sin asignar`
      );

      return;
    }

    await this.prisma.client.asignacionTurno.create({
      data: {
        organizacionId: contexto.organizacionId,
        grupoId: contexto.grupoId,
        actividadId: actividad.id,
        ambitoId,
        sesionId: contexto.sesionId,
        seccionId: contexto.seccionId,
        usuarioId: avance.candidato.usuarioId,
        vueltaNumero: vuelta.numero,
        indice: avance.candidato.indice,
      },
    });
  }

  /**
   * La vuelta de la que sale el turno de hoy. Si la anterior se consumió entera
   * (o no había ninguna), se sella una nueva **leyendo la secuencia vigente** —
   * por eso una edición del Tutor entra recién acá y nunca a mitad de vuelta
   * (decisiones 10, 14 y 15).
   */
  private async resolverVuelta(
    turno: { id: string; modo: ModoTurno },
    ultima: { vueltaNumero: number; indice: number } | null,
    organizacionId: string
  ): Promise<{ numero: number; ordenUsuarioIds: string[]; esNueva: boolean } | null> {
    if (ultima) {
      const vigente = await this.prisma.client.vueltaTurno.findFirst({
        where: { turnoActividadId: turno.id, numero: ultima.vueltaNumero },
      });

      if (vigente && !vueltaAgotada(vigente.ordenUsuarioIds, ultima.indice)) {
        return {
          numero: vigente.numero,
          ordenUsuarioIds: vigente.ordenUsuarioIds,
          esNueva: false,
        };
      }
    }

    const posiciones = await this.prisma.client.posicionTurno.findMany({
      where: { turnoActividadId: turno.id },
      orderBy: { orden: 'asc' },
    });

    if (posiciones.length === 0) {
      return null;
    }

    const numero = (ultima?.vueltaNumero ?? 0) + 1;
    const ordenUsuarioIds = sellarOrdenDeVuelta(
      posiciones.map((posicion) => posicion.usuarioId),
      turno.modo === ModoTurno.AZAR ? 'AZAR' : 'ORDEN_FIJO'
    );

    // Reentrega tras un fallo parcial: si la vuelta ya se había sellado pero la
    // asignación no llegó a escribirse, se reusa la permutación existente. Con
    // un `create` a secas el reintento moriría en el unique — y en modo AZAR
    // volver a barajar cambiaría el reparto de la vuelta a mitad de camino.
    const creada = await this.prisma.client.vueltaTurno
      .create({
        data: { organizacionId, turnoActividadId: turno.id, numero, ordenUsuarioIds },
      })
      .catch(async (error: { code?: string }) => {
        if (error?.code !== 'P2002') {
          throw error;
        }

        return await this.prisma.client.vueltaTurno.findFirstOrThrow({
          where: { turnoActividadId: turno.id, numero },
        });
      });

    return { numero: creada.numero, ordenUsuarioIds: creada.ordenUsuarioIds, esNueva: true };
  }

  /** null = la posición puede recibir el turno. */
  private motivoDeSalteo(
    usuarioId: string,
    actividad: Actividad,
    idsDelGrupo: Set<string>,
    rolPorUsuario: Map<string, string | null>
  ): MotivoSalteo | null {
    if (!idsDelGrupo.has(usuarioId)) {
      return 'YA_NO_ESTA_EN_EL_GRUPO';
    }

    // fase-14-19 + 14-21 (decisión 18): rol y turno se combinan por intersección.
    if (actividad.rolesPermitidos.length > 0) {
      const rolGrupoId = rolPorUsuario.get(usuarioId) ?? null;

      if (!rolGrupoId || !actividad.rolesPermitidos.includes(rolGrupoId)) {
        return 'SIN_EL_ROL';
      }
    }

    return null;
  }

  /**
   * ¿La actividad corre el día de esta Sesión? (fase-14-11). Sin `fechaInicio`
   * o sin timezone del Grupo no se puede decidir: se trata como "no corre" para
   * las programadas —no consumir turno es reversible, repartirlo mal no—, y las
   * no programadas siguen corriendo siempre.
   */
  private correHoy(
    actividad: Actividad,
    fechaInicio: string | undefined,
    timezone: string | undefined
  ): boolean {
    if (!tieneProgramacion(actividad)) {
      return true;
    }

    if (!fechaInicio || !timezone) {
      this.logger.warn(
        `Actividad programada ${actividad.id}: sin fechaInicio o timezone no se puede decidir el día — no se sella turno`
      );

      return false;
    }

    return estaDisponibleEn(actividad, new Date(fechaInicio), timezone);
  }

  private async yaProcesado(eventId: string): Promise<boolean> {
    const fila = await this.prisma.client.eventoProcesado.findUnique({ where: { eventId } });

    if (fila) {
      this.logger.debug(`Evento ${eventId} ya procesado — descartado`);
    }

    return fila !== null;
  }

  private async marcarProcesado(eventId: string): Promise<void> {
    try {
      await this.prisma.client.eventoProcesado.create({
        data: { eventId, consumidor: CONSUMIDOR },
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        // Otra entrega concurrente ganó la marca; el efecto ya está aplicado.
        this.logger.debug(`Evento ${eventId} procesado en paralelo — descartado`);

        return;
      }

      throw error;
    }
  }
}
