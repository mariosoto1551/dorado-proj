import { Injectable, Logger } from '@nestjs/common';

import type {
  EventEnvelope,
  NoHizoRegistradoPayload,
  SesionEventoPayload,
} from '@dorado/shared-events';
import { ROUTING_KEYS } from '@dorado/shared-events';

import { IdentityClientService } from '../clientes/identity-client.service';
import {
  estaDisponibleEn,
  tieneProgramacion,
  vigenciaVencidaEn,
} from '../comun/programacion';
import { ContextoParticipanteService } from '../comun/contexto-participante.service';
import { esDestinatario } from '../comun/destinatario';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Actividad, RegistroActividad } from '../generated/prisma/client';
import {
  ComportamientoAlCierre,
  EstadoCatalogo,
  TipoPuntaje,
  TipoRegistroActividad,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/** Identificador de este consumidor en la tabla EventoProcesado (ADR-00 §5). */
export const CONSUMIDOR = 'activity-service';

/** Una fila NO_HIZO recién creada + la actividad que la originó (para el evento). */
interface NoHizoCreado {
  registro: RegistroActividad;
  seccionId: string;
}

/**
 * Un castigo a escribir: a quién, por qué actividad y **por cuántas
 * repeticiones** (fase-14-25). Con el default de siempre (`mínimo = 1`) el
 * campo vale 1 y el monto es el de toda la vida.
 */
interface CastigoPendiente {
  usuarioId: string;
  actividad: Actividad;
  faltantes: number;
}

/** Lo que ya pasó con un par (usuario, actividad) en la Sesión que cierra. */
interface ConteoDelPar {
  /** COMPLETADAS vivas: las que de verdad confirmó. */
  hechas: number;
  /** COMPLETADAS que el Tutor quitó (#12): intentos gastados, no devueltos. */
  perdidas: number;
  /** Hay una marca NO_HIZO del Tutor — el cierre no agrega nada encima. */
  marcadoPorTutor: boolean;
}

const SIN_REGISTROS: ConteoDelPar = { hechas: 0, perdidas: 0, marcadoPorTutor: false };

/**
 * Castigo automático al cerrar la Sesión (spec fase-14-08, Parte C). Por cada
 * obligatoria `REQUIERE_CONFIRMACION` que el Usuario NO confirmó durante el
 * día, crea un `RegistroActividad(NO_HIZO)` de sistema y publica
 * `NoHizoRegistrado` → scoring resta.
 *
 * Corre SIN contexto de tenant (sin JWT): filtra explícitamente por
 * organizacionId/grupoId del envelope (mismo criterio que los consumidores de
 * scoring). Idempotente vía `EventoProcesado`: una reentrega no duplica.
 */
@Injectable()
export class CierreService {
  private readonly logger = new Logger(CierreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityClientService,
    private readonly eventos: EventosPublisherService,
    private readonly contexto: ContextoParticipanteService
  ) {}

  async procesarSesionCerrada(envelope: EventEnvelope<SesionEventoPayload>): Promise<void> {
    if (await this.yaProcesado(envelope.eventId)) {
      return;
    }

    const { sesionId, seccionId, organizacionId, grupoId, fechaInicio } = envelope.payload;

    const todas = await this.prisma.client.actividad.findMany({
      where: {
        organizacionId,
        grupoId,
        estado: EstadoCatalogo.ACTIVA,
        tipoPuntaje: TipoPuntaje.OBLIGATORIA,
        comportamientoAlCierre: ComportamientoAlCierre.REQUIERE_CONFIRMACION,
      },
    });

    // fase-14-11: una obligatoria programada solo se castiga el día que le toca.
    // Sin esto el sistema restaría puntos por no hacer algo que no correspondía
    // hacer — bug de puntaje, no cosmético.
    const obligatorias = await this.filtrarProgramadasDelDia(todas, grupoId, fechaInicio);

    // Pares (usuario × obligatoria) que faltan penalizar, con cuántas
    // repeticiones les faltaron. Se salta el que llegó al mínimo de la actividad
    // (fase-14-25; con el default de 1, "el que confirmó al menos una vez") y el
    // que ya tiene un NO_HIZO del tutor a mano — ese no se duplica.
    const pendientes = await this.paresPendientes(obligatorias, {
      organizacionId,
      grupoId,
      sesionId,
      // fase-14-21: hace falta para resolver el turno con frecuencia SECCION.
      seccionId,
    });

    let creados: NoHizoCreado[] = [];

    try {
      creados = await this.prisma.client.$transaction(async (tx) => {
        const filas: NoHizoCreado[] = [];

        for (const { usuarioId, actividad, faltantes } of pendientes) {
          const registro = await tx.registroActividad.create({
            data: {
              organizacionId,
              grupoId,
              usuarioId,
              actividadId: actividad.id,
              sesionId,
              seccionId,
              tipo: TipoRegistroActividad.NO_HIZO,
              // Snapshot al cierre: vale el valorPuntos vigente al cerrar.
              // fase-14-25: por cada repetición que faltó para llegar al mínimo
              // (decisión 12). Con el mínimo por default, `faltantes` es 1 y el
              // monto es exactamente el de antes del ítem.
              valorPuntosSnapshot: -actividad.valorPuntos * faltantes,
              registradoPorId: 'SYSTEM',
              registradoPorTipo: 'SYSTEM',
            },
          });

          filas.push({ registro, seccionId });
        }

        // Marca de procesado en la MISMA transacción que los registros.
        await tx.eventoProcesado.create({
          data: { eventId: envelope.eventId, consumidor: CONSUMIDOR },
        });

        return filas;
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        // Otra entrega concurrente ganó la marca: el efecto ya está aplicado.
        this.logger.debug(`Evento ${envelope.eventId} procesado en paralelo — descartado`);

        return;
      }

      throw error;
    }

    // Publicar DESPUÉS del commit (patrón publicar-tras-commit, fase-02).
    for (const { registro } of creados) {
      await this.eventos.publicar<NoHizoRegistradoPayload>({
        eventType: 'NoHizoRegistrado',
        routingKey: ROUTING_KEYS.NO_HIZO_REGISTRADO,
        organizacionId,
        grupoId,
        payload: {
          registroId: registro.id,
          usuarioId: registro.usuarioId,
          actividadId: registro.actividadId,
          sesionId: registro.sesionId,
          seccionId: registro.seccionId,
          valorPuntosSnapshot: registro.valorPuntosSnapshot,
          registradoPorId: 'SYSTEM',
          registradoPorTipo: 'SYSTEM',
        },
      });
    }

    if (creados.length > 0) {
      this.logger.log(
        `SesionCerrada ${sesionId}: ${creados.length} no-hizo automáticos generados (grupo ${grupoId})`
      );
    }

    // fase-14-24: al final, y FUERA de la transacción del castigo a propósito —
    // archivar es independiente de si hubo o no no-hizo que registrar, y una
    // falla acá no debe deshacer un ledger ya escrito. Si no corre, la actividad
    // vencida simplemente se archiva en el cierre siguiente.
    await this.archivarVencidas(organizacionId, grupoId, fechaInicio);
  }

  /**
   * Archiva las actividades cuya vigencia terminó antes del día de la Sesión que
   * se cierra (fase-14-24, decisión 11).
   *
   * Vive acá porque el cierre de Sesión es **el único punto del sistema que
   * corre una vez por día por grupo y que ya resolvió la fecha y la timezone**.
   * Un cron nuevo sería una segunda fuente de verdad sobre "qué día es hoy para
   * este grupo", que es justo lo que el ítem 11 se cuidó de no crear.
   *
   * Sin `fechaInicio` (mensaje viejo en la cola) **no se archiva nada**: ante la
   * duda no se cambia el catálogo, mismo criterio que el castigo automático.
   *
   * No es una operación destructiva: `ARCHIVADA` ya existe y ya significa esto,
   * el ledger de los días en que la actividad sí corrió queda intacto (regla 6),
   * y el Tutor puede desarchivarla —aunque para revivirla de verdad tenga que
   * correr el `hasta`, o se vuelve a archivar en el cierre siguiente—.
   */
  private async archivarVencidas(
    organizacionId: string,
    grupoId: string,
    fechaInicio: string | undefined
  ): Promise<void> {
    if (!fechaInicio) {
      return;
    }

    const candidatas = await this.prisma.client.actividad.findMany({
      where: {
        organizacionId,
        grupoId,
        estado: EstadoCatalogo.ACTIVA,
        vigenteHasta: { not: null },
      },
      select: { id: true, vigenteHasta: true },
    });

    if (candidatas.length === 0) {
      return;
    }

    const grupo = await this.identity.obtenerGrupo(grupoId);

    if (!grupo) {
      this.logger.warn(
        `Grupo ${grupoId} no encontrado en identity — no se archivan las actividades vencidas`
      );

      return;
    }

    const inicio = new Date(fechaInicio);
    const vencidas = candidatas.filter((actividad) =>
      vigenciaVencidaEn(actividad.vigenteHasta, inicio, grupo.timezone)
    );

    if (vencidas.length === 0) {
      return;
    }

    await this.prisma.client.actividad.updateMany({
      where: { id: { in: vencidas.map((actividad) => actividad.id) } },
      data: { estado: EstadoCatalogo.ARCHIVADA },
    });

    this.logger.log(
      `SesionCerrada: ${vencidas.length} actividad(es) archivada(s) por vencimiento (grupo ${grupoId})`
    );
  }

  /**
   * Pares (usuarioId, actividad) que no llegaron al mínimo de esta sesión, con
   * cuántas repeticiones les faltaron (fase-14-25). Con el mínimo por default
   * —1, el de toda actividad anterior al ítem— esto es exactamente lo de antes:
   * "sin ninguna confirmación, castigo de 1".
   */
  private async paresPendientes(
    obligatorias: Actividad[],
    scope: {
      organizacionId: string;
      grupoId: string;
      sesionId: string;
      seccionId?: string;
    }
  ): Promise<CastigoPendiente[]> {
    if (obligatorias.length === 0) {
      return [];
    }

    const actividadIds = obligatorias.map((actividad) => actividad.id);

    const [usuarios, registros] = await Promise.all([
      this.identity.usuariosDelGrupo(scope.grupoId),
      this.prisma.client.registroActividad.findMany({
        where: {
          organizacionId: scope.organizacionId,
          grupoId: scope.grupoId,
          sesionId: scope.sesionId,
          actividadId: { in: actividadIds },
        },
        select: {
          usuarioId: true,
          actividadId: true,
          // fase-14-25: ya no alcanza con saber que HAY un registro — hay que
          // contar cuántas confirmaciones vivas hubo contra el mínimo.
          tipo: true,
          eliminado: true,
        },
      }),
    ]);

    const conteos = agruparPorPar(registros);

    // fase-14-19: una obligatoria restringida por rol solo castiga a quien tiene
    // ese rol. Es el punto de aplicación que NO se ve en ninguna pantalla — si
    // se olvida, el sistema resta puntos por no hacer algo que para ese
    // participante nunca existió, y aparece al día siguiente como un puntaje
    // negativo inexplicable. Se paga una sola llamada, y solo si el catálogo del
    // grupo tiene alguna restricción (decisión 13).
    //
    // fase-14-24: lo mismo vale para el destinatario nominal — una obligatoria
    // asignada a Ana no puede castigar a Luis. `resolverParaGrupo` arma el
    // contexto de TODO el grupo con dos llamadas en total (no dos por persona),
    // y con cero si el catálogo no tiene ninguna restricción.
    const contextoPorUsuario = await this.contexto.resolverParaGrupo(
      scope.grupoId,
      usuarios.map((usuario) => usuario.id),
      obligatorias
    );

    // fase-14-21: para una obligatoria con turno activo, el ÚNICO candidato es
    // el asignado del ámbito — el resto del grupo ni se evalúa (decisiones 6 y
    // 17). Es el mismo punto ciego que el rol del #19: si esto falta, cinco
    // personas reciben −10 por algo que su pantalla mostró sin botón.
    const asignadoPorActividad = await this.asignadosDelAmbito(obligatorias, scope);

    const pendientes: CastigoPendiente[] = [];

    for (const actividad of obligatorias) {
      const conTurno = asignadoPorActividad.has(actividad.id);
      // `null` = tiene turnos pero hoy no le tocó a nadie (día no programado o
      // ninguna posición válida): no se castiga a nadie.
      const asignado = asignadoPorActividad.get(actividad.id) ?? null;

      if (conTurno && !asignado) {
        continue;
      }

      const candidatos = asignado
        ? usuarios.filter((usuario) => usuario.id === asignado)
        : usuarios;

      for (const usuario of candidatos) {
        const contexto = contextoPorUsuario.get(usuario.id);

        if (!contexto || !esDestinatario(actividad, contexto)) {
          continue;
        }

        const faltantes = this.repeticionesFaltantes(
          actividad,
          conteos.get(`${usuario.id}::${actividad.id}`) ?? SIN_REGISTROS
        );

        if (faltantes > 0) {
          pendientes.push({ usuarioId: usuario.id, actividad, faltantes });
        }
      }
    }

    return pendientes;
  }

  /**
   * Cuántas confirmaciones le faltaron a este par para no perder puntos
   * (fase-14-25). 0 = no se castiga.
   *
   * Dos cosas que NO son obvias:
   *
   * - **Una marca del Tutor cancela el castigo automático entero**, esté viva o
   *   deshecha. Viva porque ya castigó (decisión 15); deshecha porque es el
   *   comportamiento que este ítem encontró y no le toca cambiarlo — el
   *   automático se saltaba cualquier par con registro, sin mirar el estado.
   * - **Las repeticiones quemadas bajan el mínimo** (decisión 14): exigir 3
   *   cuando el Tutor dejó cupo para 1 sería castigar por no llegar a un número
   *   al que el servidor ya no dejaba llegar, encima del castigo que la marca
   *   roja aplicó. Doble castigo por un solo hecho.
   */
  private repeticionesFaltantes(actividad: Actividad, conteo: ConteoDelPar): number {
    if (conteo.marcadoPorTutor) {
      return 0;
    }

    const topeEfectivo = Math.max(0, actividad.repeticionesMaximasSesion - conteo.perdidas);
    const minimoEfectivo = Math.min(actividad.repeticionesMinimasSesion, topeEfectivo);

    return Math.max(0, minimoEfectivo - conteo.hechas);
  }

  /**
   * A quién le tocaba cada obligatoria con turno en el ámbito de esta Sesión
   * (fase-14-21). Las actividades **sin** turno activo no entran al mapa, y esa
   * ausencia es la que las mantiene como «de todos».
   *
   * El valor `null` significa algo distinto de «no está»: la actividad rota
   * pero hoy no se selló turno (el día no le tocaba por el #11, o ninguna
   * posición quedó válida) — y entonces no se castiga a nadie.
   */
  private async asignadosDelAmbito(
    obligatorias: Actividad[],
    scope: { grupoId: string; sesionId: string; seccionId?: string }
  ): Promise<Map<string, string | null>> {
    const turnos = await this.prisma.client.turnoActividad.findMany({
      where: { grupoId: scope.grupoId, activo: true },
    });

    const porActividad = new Map<string, string | null>();
    const conTurno = turnos.filter((turno) =>
      obligatorias.some((actividad) => actividad.id === turno.actividadId)
    );

    if (conTurno.length === 0) {
      return porActividad;
    }

    const asignaciones = await this.prisma.client.asignacionTurno.findMany({
      where: {
        actividadId: { in: conTurno.map((turno) => turno.actividadId) },
        // Cubre las dos frecuencias: con SESION el ámbito es la sesión, con
        // SECCION es la sección, y una sola consulta resuelve ambas.
        ambitoId: { in: [scope.sesionId, ...(scope.seccionId ? [scope.seccionId] : [])] },
      },
    });
    const asignadoPorActividad = new Map(
      asignaciones.map((asignacion) => [asignacion.actividadId, asignacion.usuarioId])
    );

    for (const turno of conTurno) {
      porActividad.set(turno.actividadId, asignadoPorActividad.get(turno.actividadId) ?? null);
    }

    return porActividad;
  }

  /**
   * Quita las obligatorias programadas (fase-14-11) que no correspondían al día
   * de la Sesión que se cerró. El día sale de `fechaInicio` de la Sesión, en la
   * timezone del Grupo — nunca del reloj del cierre: la Sesión del martes cierra
   * a las 00:00 del miércoles, así que "ahora" daría el día equivocado.
   *
   * Si el envelope llega **sin** `fechaInicio` (mensaje viejo en la cola durante
   * un despliegue) no se puede saber el día: se saltean TODAS las programadas.
   * Ante la duda no se restan puntos; las no programadas siguen igual.
   */
  private async filtrarProgramadasDelDia(
    obligatorias: Actividad[],
    grupoId: string,
    fechaInicioSesion: string | undefined
  ): Promise<Actividad[]> {
    const programadas = obligatorias.filter(tieneProgramacion);

    if (programadas.length === 0) {
      return obligatorias;
    }

    if (!fechaInicioSesion) {
      this.logger.warn(
        `SesionCerrada sin fechaInicio en el payload — se saltean ${programadas.length} obligatoria(s) programada(s) del grupo ${grupoId}`
      );

      return obligatorias.filter((actividad) => !tieneProgramacion(actividad));
    }

    const grupo = await this.identity.obtenerGrupo(grupoId);

    if (!grupo) {
      this.logger.warn(
        `Grupo ${grupoId} no encontrado en identity — se saltean las obligatorias programadas`
      );

      return obligatorias.filter((actividad) => !tieneProgramacion(actividad));
    }

    const inicio = new Date(fechaInicioSesion);

    return obligatorias.filter((actividad) =>
      estaDisponibleEn(actividad, inicio, grupo.timezone)
    );
  }

  private async yaProcesado(eventId: string): Promise<boolean> {
    const fila = await this.prisma.client.eventoProcesado.findUnique({
      where: { eventId },
    });

    if (fila) {
      this.logger.debug(`Evento ${eventId} ya procesado — descartado`);
    }

    return fila !== null;
  }
}

/**
 * Agrupa los registros de la Sesión por par (usuario, actividad), contando
 * confirmaciones vivas y quemadas por separado (fase-14-25). Antes del ítem
 * alcanzaba con un `Set` de pares con algún registro: el castigo era binario.
 */
function agruparPorPar(
  registros: { usuarioId: string; actividadId: string; tipo: string; eliminado: boolean }[]
): Map<string, ConteoDelPar> {
  const conteos = new Map<string, ConteoDelPar>();

  for (const registro of registros) {
    const clave = `${registro.usuarioId}::${registro.actividadId}`;
    const conteo = conteos.get(clave) ?? { ...SIN_REGISTROS };

    if (registro.tipo === TipoRegistroActividad.NO_HIZO) {
      conteo.marcadoPorTutor = true;
    } else if (registro.eliminado) {
      conteo.perdidas += 1;
    } else {
      conteo.hechas += 1;
    }

    conteos.set(clave, conteo);
  }

  return conteos;
}
