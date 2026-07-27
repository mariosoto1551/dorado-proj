import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ActividadRegistroEliminadoPayload,
  ActividadRegistroRevertidoPayload,
  ROUTING_KEYS,
} from '@dorado/shared-events';
import {
  CompletadaOpcionalDto,
  EstadoSeccion,
  EstadoSesion,
  MarcaRojaDto,
  MiEstadoActividadHoyDto,
  MiEstadoHoyDto,
  RegistroActividadDto,
  RegistroConductaDto,
  Rol,
  TenantContext,
  TipoMarcaRoja,
} from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { SessionClientService } from '../clientes/session-client.service';
import { deadlineVencido, instanteDeDeadline } from '../comun/deadline';
import {
  ActividadDenegadaPorTutorException,
  ActividadNoDisponibleHoyException,
  ActividadPersonalDeOtroUsuarioException,
  CronometroNoIniciadoException,
  CronometroVencidoException,
  DeadlineVencidoException,
  EsTareaDeEquipoException,
  LimiteRepeticionesAlcanzadoException,
  MarcaNoReversibleException,
  NoHaySesionAbiertaException,
  ObligatoriaNoSeCompletaException,
} from '../comun/excepciones';
import { registroActividadADto, registroConductaADto } from '../comun/mapeadores';
import { estaDisponibleEn } from '../comun/programacion';
import {
  esVisiblePara,
  filtroVisibilidadUsuario,
} from '../comun/visibilidad-actividad';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Actividad, Conducta, RegistroActividad } from '../generated/prisma/client';
import {
  ComportamientoAlCierre,
  EstadoCatalogo,
  TipoConducta,
  TipoLimiteTiempo,
  TipoPuntaje,
  TipoRegistroActividad,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CompletarActividadRequest,
  IniciarCronometroResponse,
  RegistrarConductaRequest,
  RegistrarNoHizoRequest,
} from './dto/registro.dto';

/** Sesión resuelta contra session-service donde cae el registro. */
interface SesionDeRegistro {
  seccionId: string;
  sesionId: string;
  fechaInicioSesion: Date;
}

/**
 * Cuándo el tutor aplicó la marca (fase-14-12): un NO_HIZO se creó en ese
 * momento; una repetición quemada existía desde antes y se marcó al quitarla.
 */
function instanteDeLaMarca(marca: RegistroActividad): Date {
  return marca.tipo === TipoRegistroActividad.NO_HIZO
    ? marca.createdAt
    : (marca.eliminadoEn ?? marca.createdAt);
}

function agruparMarcasPorActividad(
  marcas: RegistroActividad[]
): Map<string, RegistroActividad[]> {
  const porActividad = new Map<string, RegistroActividad[]>();

  for (const marca of marcas) {
    const lista = porActividad.get(marca.actividadId) ?? [];
    lista.push(marca);
    porActividad.set(marca.actividadId, lista);
  }

  return porActividad;
}

/**
 * La nota de la marca más reciente que tenga una (fase-14-12). Se ordena acá y
 * no en la query porque el instante relevante depende del tipo de marca.
 */
function ultimoMotivo(marcas: RegistroActividad[]): string | null {
  const conMotivo = marcas
    .filter((marca) => marca.motivoTutor !== null)
    .sort((a, b) => instanteDeLaMarca(b).getTime() - instanteDeLaMarca(a).getTime());

  return conMotivo[0]?.motivoTutor ?? null;
}

/**
 * Endpoints de registro (spec fase-07 Parte A): marcar actividades hechas /
 * no hechas y conductas. Cada registro guarda su snapshot de puntos CON SIGNO
 * — scoring-service deriva el puntaje sumando esos snapshots vía eventos,
 * nunca hay un acumulado mutable (regla 1 de CLAUDE.md).
 *
 * Los eventos se publican DESPUÉS del commit (patrón identity fase-02).
 */
@Injectable()
export class RegistroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityClientService,
    private readonly session: SessionClientService,
    private readonly eventos: EventosPublisherService
  ) {}

  /** POST /activity/actividades/:id/iniciar-cronometro — USUARIO (self). */
  async iniciarCronometro(
    tenant: TenantContext,
    actividadId: string
  ): Promise<IniciarCronometroResponse> {
    const actividad = await this.buscarActividadActiva(actividadId);

    if (actividad.tipoLimiteTiempo !== TipoLimiteTiempo.CRONOMETRO) {
      throw new BadRequestException(
        'La actividad no usa cronómetro (tipoLimiteTiempo distinto de CRONOMETRO)'
      );
    }

    // Solo USUARIO llega acá (RolesGuard) y la actividad ya pasó el filtro de
    // tenant (su grupo), así que el usuario objetivo es siempre él mismo.
    const usuarioId = tenant.principalId;

    this.asegurarActividadVisible(actividad, tenant, usuarioId);

    const sesion = await this.resolverSesionAbierta(actividad.grupoId);

    // fase-14-11: no tiene sentido arrancar un cronómetro que hoy no se va a
    // poder cerrar (el `completar` lo rechazaría). fase-14-12: ídem si el tutor
    // ya denegó la actividad.
    await this.asegurarProgramacionVigente(actividad, sesion);
    await this.asegurarNoDenegada(actividadId, usuarioId, sesion.sesionId);

    const ahora = new Date();

    // "Crea/reemplaza" (spec): reiniciar el cronómetro pisa el anterior.
    await this.prisma.client.cronometroActivo.upsert({
      where: {
        usuarioId_actividadId_sesionId: {
          usuarioId,
          actividadId,
          sesionId: sesion.sesionId,
        },
      },
      create: { usuarioId, actividadId, sesionId: sesion.sesionId, iniciadoEn: ahora },
      update: { iniciadoEn: ahora },
    });

    const venceEn = new Date(
      ahora.getTime() + (actividad.duracionCronometroMinutos ?? 0) * 60000
    );

    return {
      actividadId,
      sesionId: sesion.sesionId,
      iniciadoEn: ahora.toISOString(),
      venceEn: venceEn.toISOString(),
    };
  }

  /** POST /activity/actividades/:id/completar — validaciones 1–7 de la spec. */
  async completar(
    tenant: TenantContext,
    actividadId: string,
    datos: CompletarActividadRequest
  ): Promise<RegistroActividadDto> {
    const actividad = await this.buscarActividadActiva(actividadId);

    // fase-14-09: una tarea de EQUIPO no se completa por la ruta individual —
    // va por POST /activity/equipos/:equipoId/tareas/:actividadId/completar.
    if (actividad.alcance === 'EQUIPO') {
      throw new EsTareaDeEquipoException();
    }

    // fase-14-08: una OBLIGATORIA con ASUME_HECHA sigue sin completarse — no
    // hacer nada es su estado esperado de "cumplida" (spec fase-07, validación
    // 2). Con REQUIERE_CONFIRMACION, en cambio, el Usuario confirma vía este
    // mismo endpoint: mismo flujo, pero 0 puntos y SIN evento de dominio.
    const esConfirmacion =
      actividad.tipoPuntaje === TipoPuntaje.OBLIGATORIA &&
      actividad.comportamientoAlCierre === ComportamientoAlCierre.REQUIERE_CONFIRMACION;

    if (actividad.tipoPuntaje === TipoPuntaje.OBLIGATORIA && !esConfirmacion) {
      throw new ObligatoriaNoSeCompletaException();
    }

    const usuarioId = await this.resolverUsuarioObjetivo(tenant, actividad.grupoId, datos.usuarioId);

    this.asegurarActividadVisible(actividad, tenant, usuarioId);

    const sesion = await this.resolverSesionAbierta(actividad.grupoId);

    await this.asegurarProgramacionVigente(actividad, sesion);

    // fase-14-12: una obligatoria que el tutor marcó como no hecha queda
    // bloqueada — el usuario no puede "arreglarla" volviendo a confirmar.
    await this.asegurarNoDenegada(actividadId, usuarioId, sesion.sesionId);

    // Sin `eliminado: false` a propósito (fase-14-12, decisión 1): una
    // repetición que el tutor quitó es un intento GASTADO, no un intento
    // devuelto. Contarla acá es lo que hace que el cupo quede quemado de
    // verdad; `mi-estado-hoy` expone el mismo número como `topeEfectivo`
    // para que la pantalla no prometa un botón que el servidor va a rechazar.
    const intentosUsados = await this.prisma.client.registroActividad.count({
      where: {
        usuarioId,
        actividadId,
        sesionId: sesion.sesionId,
        tipo: TipoRegistroActividad.COMPLETADA,
      },
    });

    if (intentosUsados >= actividad.repeticionesMaximasSesion) {
      throw new LimiteRepeticionesAlcanzadoException();
    }

    const ahora = new Date();

    if (actividad.tipoLimiteTiempo === TipoLimiteTiempo.DEADLINE) {
      await this.asegurarDeadlineVigente(actividad, sesion, ahora);
    }

    const conCronometro = actividad.tipoLimiteTiempo === TipoLimiteTiempo.CRONOMETRO;

    if (conCronometro) {
      await this.asegurarCronometroVigente(actividad, usuarioId, sesion.sesionId, ahora);
    }

    const registro = await this.prisma.client.$transaction(async (tx) => {
      const fila = await tx.registroActividad.create({
        data: {
          // organizacionId SIEMPRE del JWT validado, nunca del cliente (regla 3).
          organizacionId: tenant.organizacionId,
          grupoId: actividad.grupoId,
          usuarioId,
          actividadId,
          sesionId: sesion.sesionId,
          seccionId: sesion.seccionId,
          tipo: TipoRegistroActividad.COMPLETADA,
          // Confirmar una obligatoria vale 0 puntos: solo evita el castigo al
          // cierre, no otorga puntos (spec fase-14-08, decisión 2).
          valorPuntosSnapshot: esConfirmacion ? 0 : actividad.valorPuntos,
          registradoPorId: tenant.principalId,
          registradoPorTipo: tenant.principalType,
        },
      });

      if (conCronometro) {
        // Al completar con éxito se borra la fila de CronometroActivo (spec).
        await tx.cronometroActivo.deleteMany({
          where: { usuarioId, actividadId, sesionId: sesion.sesionId },
        });
      }

      return fila;
    });

    // La confirmación NO publica evento de dominio (0 pts → no toca el ledger
    // de scoring): vive solo en activity y la lee el consumidor de cierre para
    // saltear el castigo (spec fase-14-08, Parte B).
    if (!esConfirmacion) {
      await this.eventos.publicar({
        eventType: 'ActividadCompletada',
        routingKey: ROUTING_KEYS.ACTIVIDAD_COMPLETADA,
        organizacionId: tenant.organizacionId,
        grupoId: actividad.grupoId,
        payload: {
          registroId: registro.id,
          usuarioId,
          actividadId,
          sesionId: sesion.sesionId,
          seccionId: sesion.seccionId,
          valorPuntosSnapshot: registro.valorPuntosSnapshot,
          registradoPorId: tenant.principalId,
          registradoPorTipo: tenant.principalType,
        },
      });
    }

    return registroActividadADto(registro);
  }

  /**
   * GET /activity/grupos/:grupoId/mi-estado-hoy — USUARIO (self). Estado real
   * (del servidor) de cada actividad ACTIVA del grupo en la Sesión abierta
   * actual: reemplaza el `Set` optimista de la home y habilita la barrita de
   * repeticiones (spec fase-14-08, Parte B). Sin Sesión ABIERTA devuelve
   * `{ sesionId: null, actividades: [] }` — no es un error.
   */
  async miEstadoHoy(tenant: TenantContext, grupoId: string): Promise<MiEstadoHoyDto> {
    const seccion = await this.session.obtenerSeccionActual(grupoId);
    const sesionAbierta =
      seccion?.estado === EstadoSeccion.ABIERTA
        ? seccion.sesiones.find((sesion) => sesion.estado === EstadoSesion.ABIERTA)
        : undefined;

    if (!sesionAbierta) {
      return { sesionId: null, actividades: [] };
    }

    const usuarioId = tenant.principalId;

    const [actividades, conteos, marcas] = await Promise.all([
      this.prisma.client.actividad.findMany({
        where: {
          grupoId,
          estado: EstadoCatalogo.ACTIVA,
          // fase-14-10: sus propias actividades + las del catálogo del tutor;
          // nunca las personales de otro integrante (Parte C).
          ...filtroVisibilidadUsuario(usuarioId),
        },
        orderBy: { createdAt: 'asc' },
      }),
      // vecesHechas: las completadas que siguen VIVAS (las barritas verdes).
      // Las que el tutor quitó no cuentan acá — cuentan como perdidas, abajo.
      this.prisma.client.registroActividad.groupBy({
        by: ['actividadId'],
        where: {
          usuarioId,
          sesionId: sesionAbierta.id,
          tipo: TipoRegistroActividad.COMPLETADA,
          eliminado: false,
        },
        _count: { _all: true },
      }),
      this.buscarMarcasRojas(usuarioId, sesionAbierta.id),
    ]);

    const vecesPorActividad = new Map(
      conteos.map((conteo) => [conteo.actividadId, conteo._count._all])
    );
    const marcasPorActividad = agruparMarcasPorActividad(marcas);

    // La timezone del Grupo se pide UNA vez por request, y solo si hace falta:
    // para evaluar actividades programadas (fase-14-11) o para resolver el
    // instante del deadline (fase-14-14). Sin ninguna de las dos no se paga.
    const necesitaTimezone = actividades.some(
      (actividad) =>
        actividad.diasSemana.length > 0 ||
        actividad.tipoLimiteTiempo === TipoLimiteTiempo.DEADLINE
    );
    const timezone = necesitaTimezone
      ? (await this.identity.obtenerGrupo(grupoId))?.timezone
      : undefined;
    const inicioSesion = new Date(sesionAbierta.fechaInicio);

    const items: MiEstadoActividadHoyDto[] = actividades.map((actividad) => {
      const vecesHechas = vecesPorActividad.get(actividad.id) ?? 0;
      const esConfirmable =
        actividad.tipoPuntaje === TipoPuntaje.OBLIGATORIA &&
        actividad.comportamientoAlCierre === ComportamientoAlCierre.REQUIERE_CONFIRMACION;
      // fase-14-12: las marcas rojas del tutor sobre esta actividad, hoy.
      const marcasDeLaActividad = marcasPorActividad.get(actividad.id) ?? [];
      const vecesPerdidas = marcasDeLaActividad.filter(
        (marca) => marca.tipo === TipoRegistroActividad.COMPLETADA
      ).length;

      return {
        actividadId: actividad.id,
        tipoPuntaje: actividad.tipoPuntaje as MiEstadoActividadHoyDto['tipoPuntaje'],
        comportamientoAlCierre:
          actividad.comportamientoAlCierre as MiEstadoActividadHoyDto['comportamientoAlCierre'],
        repeticionesMaximasSesion: actividad.repeticionesMaximasSesion,
        vecesHechas,
        confirmada: esConfirmable && vecesHechas > 0,
        vecesPerdidas,
        // Nunca negativo: el tutor no puede quitar más de lo que se registró,
        // pero un Math.max evita que un dato raro apague la pantalla entera.
        topeEfectivo: Math.max(0, actividad.repeticionesMaximasSesion - vecesPerdidas),
        denegada: marcasDeLaActividad.some(
          (marca) => marca.tipo === TipoRegistroActividad.NO_HIZO
        ),
        motivoTutor: ultimoMotivo(marcasDeLaActividad),
        // fase-14-14: instante absoluto para la cuenta regresiva del cliente.
        // Sin timezone resuelta queda null y la pantalla cae al texto de
        // siempre (`deadlineHora`), sin deshabilitar nada.
        deadlineEn:
          timezone &&
          actividad.tipoLimiteTiempo === TipoLimiteTiempo.DEADLINE &&
          actividad.deadlineHora
            ? instanteDeDeadline(inicioSesion, actividad.deadlineHora, timezone).toISOString()
            : null,
        // Sin timezone resuelta (identity no respondió) se asume disponible: es
        // el servidor el que decide de verdad al registrar, y una pantalla que
        // apaga botones por una falla ajena es peor que una que los deja.
        disponibleHoy: timezone
          ? estaDisponibleEn(actividad.diasSemana, inicioSesion, timezone)
          : true,
        diasSemana: actividad.diasSemana,
      };
    });

    return { sesionId: sesionAbierta.id, actividades: items };
  }

  /** POST /activity/actividades/:id/no-hizo — solo Tutores, solo OBLIGATORIA. */
  async registrarNoHizo(
    tenant: TenantContext,
    actividadId: string,
    datos: RegistrarNoHizoRequest
  ): Promise<RegistroActividadDto> {
    const actividad = await this.buscarActividadActiva(actividadId);

    if (actividad.tipoPuntaje !== TipoPuntaje.OBLIGATORIA) {
      throw new BadRequestException(
        'Solo una actividad OBLIGATORIA se marca como no hecha — las opcionales simplemente no se completan'
      );
    }

    const usuarioId = await this.resolverUsuarioObjetivo(tenant, actividad.grupoId, datos.usuarioId);

    // Defensa en profundidad: el contenido de integrante es siempre OPCIONAL
    // (fase-14-10, decisión 8), así que acá no debería llegar ninguno — si algún
    // día eso cambia, el dueño sigue siendo el único alcanzado.
    this.asegurarActividadVisible(actividad, tenant, usuarioId);

    const sesion = await this.resolverSesionAbierta(actividad.grupoId);

    // fase-14-11: tampoco se castiga a mano por un día que no correspondía.
    await this.asegurarProgramacionVigente(actividad, sesion);

    // Sin límite de repeticiones a propósito (spec: cada "no hizo" resta
    // independientemente, regla explícita del proyecto original).
    const registro = await this.prisma.client.registroActividad.create({
      data: {
        organizacionId: tenant.organizacionId,
        grupoId: actividad.grupoId,
        usuarioId,
        actividadId,
        sesionId: sesion.sesionId,
        seccionId: sesion.seccionId,
        tipo: TipoRegistroActividad.NO_HIZO,
        valorPuntosSnapshot: -actividad.valorPuntos,
        registradoPorId: tenant.principalId,
        registradoPorTipo: tenant.principalType,
        // fase-14-12: la nota que el integrante va a leer en su pantalla.
        motivoTutor: datos.motivo ?? null,
      },
    });

    await this.eventos.publicar({
      eventType: 'NoHizoRegistrado',
      routingKey: ROUTING_KEYS.NO_HIZO_REGISTRADO,
      organizacionId: tenant.organizacionId,
      grupoId: actividad.grupoId,
      payload: {
        registroId: registro.id,
        usuarioId,
        actividadId,
        sesionId: sesion.sesionId,
        seccionId: sesion.seccionId,
        valorPuntosSnapshot: registro.valorPuntosSnapshot,
        registradoPorId: tenant.principalId,
        registradoPorTipo: 'TUTOR',
      },
    });

    // Override (fase-14): si la obligatoria era confirmable y el usuario ya la
    // había confirmado, esa confirmación deja de valer — se da de baja para que
    // su pantalla la muestre como NO hecha. Sin evento: la confirmación valía 0
    // pts (no tiene asiento en el ledger); el castigo lo aplica el NO_HIZO de
    // arriba, y `paresPendientes` del cierre ya no duplica (hay un registro).
    if (actividad.comportamientoAlCierre === ComportamientoAlCierre.REQUIERE_CONFIRMACION) {
      await this.prisma.client.registroActividad.updateMany({
        where: {
          usuarioId,
          actividadId,
          sesionId: sesion.sesionId,
          tipo: TipoRegistroActividad.COMPLETADA,
          eliminado: false,
        },
        data: {
          eliminado: true,
          eliminadoPorTutorId: tenant.principalId,
          eliminadoEn: new Date(),
        },
      });
    }

    return registroActividadADto(registro);
  }

  /**
   * GET /activity/grupos/:grupoId/usuarios/:usuarioId/marcas — Tutor. Las marcas
   * rojas VIVAS de ese usuario en la Sesión abierta (fase-14-12): obligatorias
   * denegadas y repeticiones quemadas, para poder deshacerlas. Sin Sesión
   * ABIERTA devuelve [] — mismo criterio que `listarCompletadasOpcionales`.
   */
  async listarMarcasRojas(
    tenant: TenantContext,
    grupoId: string,
    usuarioId: string
  ): Promise<MarcaRojaDto[]> {
    const usuarioObjetivo = await this.resolverUsuarioObjetivo(tenant, grupoId, usuarioId);
    const seccion = await this.session.obtenerSeccionActual(grupoId);
    const sesionAbierta =
      seccion?.estado === EstadoSeccion.ABIERTA
        ? seccion.sesiones.find((sesion) => sesion.estado === EstadoSesion.ABIERTA)
        : undefined;

    if (!sesionAbierta) {
      return [];
    }

    const marcas = await this.buscarMarcasRojas(usuarioObjetivo, sesionAbierta.id);

    if (marcas.length === 0) {
      return [];
    }

    // Cruce por ID dentro del MISMO servicio (no rompe la regla 2): las
    // actividades y los registros viven los dos en activity-service.
    const actividades = await this.prisma.client.actividad.findMany({
      where: { grupoId, id: { in: marcas.map((marca) => marca.actividadId) } },
    });
    const nombres = new Map(actividades.map((actividad) => [actividad.id, actividad.nombre]));

    return marcas
      .filter((marca) => nombres.has(marca.actividadId))
      .map((marca) => ({
        registroId: marca.id,
        actividadId: marca.actividadId,
        nombre: nombres.get(marca.actividadId) ?? '',
        tipo:
          marca.tipo === TipoRegistroActividad.NO_HIZO
            ? TipoMarcaRoja.NO_HIZO
            : TipoMarcaRoja.REPETICION_QUITADA,
        // Lo que la marca le costó: el castigo del NO_HIZO, o los puntos que
        // se le descontaron al quitarle la repetición.
        puntos:
          marca.tipo === TipoRegistroActividad.NO_HIZO
            ? marca.valorPuntosSnapshot
            : -marca.valorPuntosSnapshot,
        motivoTutor: marca.motivoTutor,
        marcadaEn: instanteDeLaMarca(marca).toISOString(),
      }))
      .sort((a, b) => b.marcadaEn.localeCompare(a.marcadaEn));
  }

  /**
   * POST /activity/registros-actividad/:id/revertir — Tutor. Deshace una marca
   * roja propia (fase-14-12): restaura una COMPLETADA que había quitado, o da
   * de baja un NO_HIZO. Las dos son la misma acción para el tutor ("sacá esa
   * marca"), por eso un solo endpoint. scoring devuelve los puntos vía evento.
   */
  async revertirMarca(
    tenant: TenantContext,
    registroId: string
  ): Promise<RegistroActividadDto> {
    const registro = await this.prisma.client.registroActividad.findFirst({
      where: { id: registroId },
    });

    // Mismo 404 para inexistente y para "de otra organización": no revela nada.
    if (!registro || registro.organizacionId !== tenant.organizacionId) {
      throw new NotFoundException('Registro de actividad no encontrado');
    }

    const esCompletadaQuitada =
      registro.tipo === TipoRegistroActividad.COMPLETADA && registro.eliminado;
    const esNoHizoVivo =
      registro.tipo === TipoRegistroActividad.NO_HIZO && !registro.eliminado;

    if (!esCompletadaQuitada && !esNoHizoVivo) {
      throw new MarcaNoReversibleException();
    }

    // La marca vive dentro de su Sesión (decisión 4): una vez cerrada, lo
    // registrado queda como quedó — mismo principio que la regla 6.
    const sesion = await this.resolverSesionAbierta(registro.grupoId);

    if (registro.sesionId !== sesion.sesionId) {
      throw new NoHaySesionAbiertaException();
    }

    const ahora = new Date();
    // Restaurar NO limpia eliminadoPorTutorId/eliminadoEn (decisión 7): la fila
    // conserva la historia entera. Un NO_HIZO no tiene otro estado de baja, así
    // que se reusa el soft-delete que ya existía.
    const cambios = esCompletadaQuitada
      ? { eliminado: false, revertidoPorTutorId: tenant.principalId, revertidoEn: ahora }
      : {
          eliminado: true,
          eliminadoPorTutorId: tenant.principalId,
          eliminadoEn: ahora,
          revertidoPorTutorId: tenant.principalId,
          revertidoEn: ahora,
        };

    await this.prisma.client.registroActividad.updateMany({
      where: { id: registroId },
      data: cambios,
    });

    // Una confirmación vale 0 pts y no tiene asiento en el ledger: nada que
    // compensar (mismo criterio que `eliminarRegistroActividad`).
    if (registro.valorPuntosSnapshot !== 0) {
      await this.eventos.publicar<ActividadRegistroRevertidoPayload>({
        eventType: 'ActividadRegistroRevertido',
        routingKey: ROUTING_KEYS.ACTIVIDAD_REGISTRO_REVERTIDO,
        organizacionId: registro.organizacionId,
        grupoId: registro.grupoId,
        payload: {
          registroId,
          usuarioId: registro.usuarioId,
          revertidoPorTutorId: tenant.principalId,
          tipoRegistro: registro.tipo,
        },
      });
    }

    return registroActividadADto({ ...registro, ...cambios });
  }

  /**
   * GET /activity/grupos/:grupoId/usuarios/:usuarioId/completadas — Tutor.
   * Las OPCIONALES que el usuario completó en la Sesión abierta (no eliminadas),
   * agrupadas por actividad con sus filas individuales, para que el tutor quite
   * una (la última) o todas (fase-14). Sin Sesión ABIERTA devuelve [].
   */
  async listarCompletadasOpcionales(
    tenant: TenantContext,
    grupoId: string,
    usuarioId: string
  ): Promise<CompletadaOpcionalDto[]> {
    const usuarioObjetivo = await this.resolverUsuarioObjetivo(tenant, grupoId, usuarioId);
    const seccion = await this.session.obtenerSeccionActual(grupoId);
    const sesionAbierta =
      seccion?.estado === EstadoSeccion.ABIERTA
        ? seccion.sesiones.find((sesion) => sesion.estado === EstadoSesion.ABIERTA)
        : undefined;

    if (!sesionAbierta) {
      return [];
    }

    const opcionales = await this.prisma.client.actividad.findMany({
      where: {
        grupoId,
        estado: EstadoCatalogo.ACTIVA,
        tipoPuntaje: TipoPuntaje.OPCIONAL,
        // fase-14-10: no ofrecerle al tutor las actividades personales de OTRO
        // integrante al corregir lo completado de este usuario (Parte C).
        ...filtroVisibilidadUsuario(usuarioObjetivo),
      },
      orderBy: { createdAt: 'asc' },
    });

    if (opcionales.length === 0) {
      return [];
    }

    const registros = await this.prisma.client.registroActividad.findMany({
      where: {
        usuarioId: usuarioObjetivo,
        sesionId: sesionAbierta.id,
        tipo: TipoRegistroActividad.COMPLETADA,
        eliminado: false,
        actividadId: { in: opcionales.map((actividad) => actividad.id) },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, actividadId: true, createdAt: true },
    });

    const porActividad = new Map<string, CompletadaOpcionalDto['registros']>();

    for (const registro of registros) {
      const lista = porActividad.get(registro.actividadId) ?? [];
      lista.push({ registroId: registro.id, createdAt: registro.createdAt.toISOString() });
      porActividad.set(registro.actividadId, lista);
    }

    return opcionales
      .filter((actividad) => porActividad.has(actividad.id))
      .map((actividad) => ({
        actividadId: actividad.id,
        nombre: actividad.nombre,
        valorPuntos: actividad.valorPuntos,
        registros: porActividad.get(actividad.id) ?? [],
      }));
  }

  /**
   * DELETE /activity/registros-actividad/:id — Tutor. Soft-delete de una
   * COMPLETADA (fase-14, espejo del borrado de conducta). scoring compensa el
   * asiento vía evento; nunca DELETE físico. Una confirmación (0 pts) no tiene
   * asiento en el ledger, así que en ese caso NO se publica evento.
   */
  async eliminarRegistroActividad(
    tenant: TenantContext,
    registroId: string,
    motivo?: string
  ): Promise<RegistroActividadDto> {
    const registro = await this.prisma.client.registroActividad.findFirst({
      where: { id: registroId },
    });

    // Mismo 404 para inexistente / de otra org / no-completada (no revela nada).
    if (
      !registro ||
      registro.organizacionId !== tenant.organizacionId ||
      registro.tipo !== TipoRegistroActividad.COMPLETADA
    ) {
      throw new NotFoundException('Registro de actividad no encontrado');
    }

    if (registro.eliminado) {
      throw new ConflictException('El registro ya fue eliminado');
    }

    const ahora = new Date();
    // fase-14-12: el motivo pisa el de una marca anterior sobre la misma fila
    // (que solo puede existir si el tutor ya la había quitado y deshecho).
    const cambios = {
      eliminado: true,
      eliminadoPorTutorId: tenant.principalId,
      eliminadoEn: ahora,
      motivoTutor: motivo ?? null,
    };

    await this.prisma.client.registroActividad.updateMany({
      where: { id: registroId },
      data: cambios,
    });

    if (registro.valorPuntosSnapshot !== 0) {
      await this.eventos.publicar<ActividadRegistroEliminadoPayload>({
        eventType: 'ActividadRegistroEliminado',
        routingKey: ROUTING_KEYS.ACTIVIDAD_REGISTRO_ELIMINADO,
        organizacionId: registro.organizacionId,
        grupoId: registro.grupoId,
        payload: {
          registroId,
          usuarioId: registro.usuarioId,
          eliminadoPorTutorId: tenant.principalId,
        },
      });
    }

    return registroActividadADto({ ...registro, ...cambios });
  }

  /** POST /activity/conductas/:id/registrar — signo según tipo de conducta. */
  async registrarConducta(
    tenant: TenantContext,
    conductaId: string,
    datos: RegistrarConductaRequest
  ): Promise<RegistroConductaDto> {
    const conducta = await this.buscarConductaActiva(conductaId);

    let usuarioId: string;

    if (tenant.rol === Rol.USUARIO) {
      // Autoreporte (spec): solo mala conducta que lo permita, siempre self —
      // cualquier usuarioId recibido en el body se ignora.
      if (conducta.tipo !== TipoConducta.MALA || !conducta.permiteAutoreporte) {
        throw new ForbiddenException('Esta conducta no permite autoreporte');
      }

      usuarioId = tenant.principalId;
    } else {
      usuarioId = await this.resolverUsuarioObjetivo(tenant, conducta.grupoId, datos.usuarioId);
    }

    const sesion = await this.resolverSesionAbierta(conducta.grupoId);
    const valorConSigno =
      conducta.tipo === TipoConducta.BUENA ? conducta.valorPuntos : -conducta.valorPuntos;

    const registro = await this.prisma.client.registroConducta.create({
      data: {
        organizacionId: tenant.organizacionId,
        grupoId: conducta.grupoId,
        usuarioId,
        conductaId,
        sesionId: sesion.sesionId,
        seccionId: sesion.seccionId,
        valorPuntosSnapshot: valorConSigno,
        registradoPorId: tenant.principalId,
        registradoPorTipo: tenant.principalType,
      },
    });

    await this.eventos.publicar({
      eventType: 'ConductaRegistrada',
      routingKey: ROUTING_KEYS.CONDUCTA_REGISTRADA,
      organizacionId: tenant.organizacionId,
      grupoId: conducta.grupoId,
      payload: {
        registroId: registro.id,
        usuarioId,
        conductaId,
        tipo: conducta.tipo,
        sesionId: sesion.sesionId,
        seccionId: sesion.seccionId,
        valorPuntosSnapshot: valorConSigno,
        registradoPorId: tenant.principalId,
        registradoPorTipo: tenant.principalType,
      },
    });

    return registroConductaADto(registro);
  }

  /**
   * DELETE /activity/registros-conducta/:id — soft delete explícito (spec:
   * los usuarios pueden autoreportar mala conducta pero no eliminarla; solo
   * un tutor puede quitar). Nunca DELETE físico: scoring compensa vía evento.
   */
  async eliminarRegistroConducta(
    tenant: TenantContext,
    registroId: string
  ): Promise<RegistroConductaDto> {
    const registro = await this.prisma.client.registroConducta.findFirst({
      where: { id: registroId },
    });

    if (!registro) {
      throw new NotFoundException('Registro de conducta no encontrado');
    }

    if (registro.eliminado) {
      throw new ConflictException('El registro ya fue eliminado');
    }

    const ahora = new Date();

    await this.prisma.client.registroConducta.updateMany({
      where: { id: registroId },
      data: {
        eliminado: true,
        eliminadoPorTutorId: tenant.principalId,
        eliminadoEn: ahora,
      },
    });

    await this.eventos.publicar({
      eventType: 'ConductaRegistroEliminado',
      routingKey: ROUTING_KEYS.CONDUCTA_REGISTRO_ELIMINADO,
      organizacionId: tenant.organizacionId,
      grupoId: registro.grupoId,
      payload: {
        registroId,
        usuarioId: registro.usuarioId,
        eliminadoPorTutorId: tenant.principalId,
      },
    });

    return registroConductaADto({
      ...registro,
      eliminado: true,
      eliminadoPorTutorId: tenant.principalId,
      eliminadoEn: ahora,
    });
  }

  /**
   * Actividad ACTIVA accesible para el tenant — 404 si no existe, no es suya
   * o está archivada (spec, validación 1 de `completar`: mismo 404 en todos
   * los casos para no revelar existencia).
   */
  private async buscarActividadActiva(id: string): Promise<Actividad> {
    const actividad = await this.prisma.client.actividad.findFirst({ where: { id } });

    if (!actividad || actividad.estado !== EstadoCatalogo.ACTIVA) {
      throw new NotFoundException('Actividad no encontrada');
    }

    return actividad;
  }

  /**
   * Una actividad personal (fase-14-10, `origen = USUARIO`) solo la registra su
   * dueño. Para un USUARIO es 404 (no revela que existe la del hermano); para un
   * Tutor registrando en nombre de alguien es 403 con code propio — él sí la ve
   * en el listado del grupo, así que un 404 sería engañoso.
   */
  private asegurarActividadVisible(
    actividad: Actividad,
    tenant: TenantContext,
    usuarioObjetivo: string
  ): void {
    if (esVisiblePara(actividad, usuarioObjetivo)) {
      return;
    }

    if (tenant.rol === Rol.USUARIO) {
      throw new NotFoundException('Actividad no encontrada');
    }

    throw new ActividadPersonalDeOtroUsuarioException();
  }

  private async buscarConductaActiva(id: string): Promise<Conducta> {
    const conducta = await this.prisma.client.conducta.findFirst({ where: { id } });

    if (!conducta || conducta.estado !== EstadoCatalogo.ACTIVA) {
      throw new NotFoundException('Conducta no encontrada');
    }

    return conducta;
  }

  /**
   * Usuario sobre el que cae el registro. USUARIO: siempre él mismo (el body
   * se ignora — regla 3 de CLAUDE.md). TUTOR/ORG_ADMIN: `usuarioId` del body,
   * validado por REST interno contra identity: debe existir, ser de la misma
   * organización, pertenecer al grupo del catálogo y estar ACTIVO — 404 en
   * cualquier otro caso, sin revelar cuál falló.
   */
  private async resolverUsuarioObjetivo(
    tenant: TenantContext,
    grupoId: string,
    usuarioIdBody: string | undefined
  ): Promise<string> {
    if (tenant.rol === Rol.USUARIO) {
      return tenant.principalId;
    }

    if (!usuarioIdBody) {
      throw new BadRequestException('usuarioId es obligatorio cuando registra un tutor');
    }

    const usuario = await this.identity.obtenerUsuario(usuarioIdBody);

    if (
      !usuario ||
      usuario.organizacionId !== tenant.organizacionId ||
      usuario.grupoId !== grupoId ||
      usuario.estado !== 'ACTIVO'
    ) {
      throw new NotFoundException('Usuario no encontrado en el grupo');
    }

    return usuario.id;
  }

  /**
   * Sección ABIERTA con Sesión ABIERTA del grupo (spec, validación 3) — 409
   * `NO_HAY_SESION_ABIERTA` si no la hay (incluye Sección en EVALUACION: ahí
   * ya no se registra nada).
   */
  private async resolverSesionAbierta(grupoId: string): Promise<SesionDeRegistro> {
    const seccion = await this.session.obtenerSeccionActual(grupoId);

    if (!seccion || seccion.estado !== EstadoSeccion.ABIERTA) {
      throw new NoHaySesionAbiertaException();
    }

    const abierta = seccion.sesiones.find((sesion) => sesion.estado === EstadoSesion.ABIERTA);

    if (!abierta) {
      throw new NoHaySesionAbiertaException();
    }

    return {
      seccionId: seccion.id,
      sesionId: abierta.id,
      fechaInicioSesion: new Date(abierta.fechaInicio),
    };
  }

  /**
   * Actividad programada (fase-14-11): solo se registra en sus días. El día se
   * evalúa sobre el día de inicio de la Sesión y en la timezone del Grupo (mismo
   * criterio que el deadline). Sin días configurados no consulta nada — el caso
   * normal no paga ninguna llamada REST extra.
   */
  private async asegurarProgramacionVigente(
    actividad: Actividad,
    sesion: SesionDeRegistro
  ): Promise<void> {
    if (actividad.diasSemana.length === 0) {
      return;
    }

    const grupo = await this.identity.obtenerGrupo(actividad.grupoId);

    if (!grupo) {
      throw new NotFoundException('Grupo no encontrado');
    }

    if (!estaDisponibleEn(actividad.diasSemana, sesion.fechaInicioSesion, grupo.timezone)) {
      throw new ActividadNoDisponibleHoyException(actividad.diasSemana);
    }
  }

  /**
   * fase-14-12: las marcas rojas VIVAS de un usuario en una Sesión, en una sola
   * query — una obligatoria denegada es un NO_HIZO sin dar de baja, y una
   * repetición quemada es una COMPLETADA con `eliminado = true`.
   */
  private async buscarMarcasRojas(
    usuarioId: string,
    sesionId: string
  ): Promise<RegistroActividad[]> {
    return await this.prisma.client.registroActividad.findMany({
      where: {
        usuarioId,
        sesionId,
        OR: [
          { tipo: TipoRegistroActividad.COMPLETADA, eliminado: true },
          { tipo: TipoRegistroActividad.NO_HIZO, eliminado: false },
        ],
      },
    });
  }

  /**
   * fase-14-12: una actividad con un NO_HIZO vivo queda bloqueada para el
   * usuario hasta que el tutor deshaga la marca (decisión 2).
   */
  private async asegurarNoDenegada(
    actividadId: string,
    usuarioId: string,
    sesionId: string
  ): Promise<void> {
    const denegaciones = await this.prisma.client.registroActividad.count({
      where: {
        usuarioId,
        actividadId,
        sesionId,
        tipo: TipoRegistroActividad.NO_HIZO,
        eliminado: false,
      },
    });

    if (denegaciones > 0) {
      throw new ActividadDenegadaPorTutorException();
    }
  }

  /** Validación 5 (DEADLINE): hora límite del día de la Sesión, en tz del Grupo. */
  private async asegurarDeadlineVigente(
    actividad: Actividad,
    sesion: SesionDeRegistro,
    ahora: Date
  ): Promise<void> {
    const grupo = await this.identity.obtenerGrupo(actividad.grupoId);

    if (!grupo) {
      throw new NotFoundException('Grupo no encontrado');
    }

    if (
      actividad.deadlineHora &&
      deadlineVencido(sesion.fechaInicioSesion, actividad.deadlineHora, grupo.timezone, ahora)
    ) {
      throw new DeadlineVencidoException();
    }
  }

  /** Validación 6 (CRONOMETRO): iniciado y dentro de la duración permitida. */
  private async asegurarCronometroVigente(
    actividad: Actividad,
    usuarioId: string,
    sesionId: string,
    ahora: Date
  ): Promise<void> {
    const cronometro = await this.prisma.client.cronometroActivo.findUnique({
      where: {
        usuarioId_actividadId_sesionId: { usuarioId, actividadId: actividad.id, sesionId },
      },
    });

    if (!cronometro) {
      throw new CronometroNoIniciadoException();
    }

    const transcurridoMs = ahora.getTime() - cronometro.iniciadoEn.getTime();

    if (transcurridoMs > (actividad.duracionCronometroMinutos ?? 0) * 60000) {
      throw new CronometroVencidoException();
    }
  }
}
