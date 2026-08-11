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
  TurnoDeHoyDto,
} from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { SessionClientService } from '../clientes/session-client.service';
import { deadlineVencido, instanteDeDeadline } from '../comun/deadline';
import { requiereSeleccionDelPlan } from '../comun/elegibilidad-plan';
import {
  ActividadDenegadaPorTutorException,
  ActividadNoEsDeSuRolException,
  ActividadNoEsDeTuRolException,
  ActividadPersonalDeOtroUsuarioException,
  CronometroNoIniciadoException,
  CronometroNoRetroactivoException,
  CronometroVencidoException,
  DeadlineVencidoException,
  EsTareaDeEquipoException,
  excepcionSiNoDisponible,
  LimiteRepeticionesAlcanzadoException,
  MarcaNoReversibleException,
  MotivoRetroactivoRequeridoException,
  NoEsSuTurnoException,
  NoEsTuTurnoException,
  SesionNoEditableException,
  ObligatoriaNoSeCompletaException,
  SinTurnoVigenteException,
} from '../comun/excepciones';
import {
  resolverSesionDeTrabajo,
  type SesionDeTrabajo,
} from '../comun/sesion-abierta';
import { registroActividadADto, registroConductaADto } from '../comun/mapeadores';
import {
  estaDisponibleEn,
  motivoNoDisponible,
  tieneProgramacion,
} from '../comun/programacion';
import { ContextoParticipanteService } from '../comun/contexto-participante.service';
import { esDestinatario } from '../comun/destinatario';
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
import { PlanDiaService } from '../plan-dia/plan-dia.service';
import { PrismaService } from '../prisma/prisma.service';
import { TurnosService } from '../turnos/turnos.service';
import type {
  CompletarActividadRequest,
  IniciarCronometroResponse,
  RegistrarConductaRequest,
  RegistrarNoHizoRequest,
} from './dto/registro.dto';

/**
 * Sesión resuelta contra session-service donde cae el registro.
 *
 * fase-14-33: pasó a ser `SesionDeTrabajo` (el mismo shape más `retroactiva`,
 * `sesionNumero` y `sesionEstado`). El alias se mantiene porque los helpers de
 * validación de este archivo hablan de "la sesión del registro", no de "la
 * sesión de trabajo del tutor".
 */
type SesionDeRegistro = SesionDeTrabajo;

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
    private readonly eventos: EventosPublisherService,
    private readonly planDia: PlanDiaService,
    private readonly turnos: TurnosService,
    private readonly contexto: ContextoParticipanteService
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

    // Solo USUARIO llega acá, así que `resolverSesion` ya descarta cualquier
    // `sesionId` — el 400 de abajo es para el día que este endpoint se le
    // habilite a un Tutor (decisión 3: un cronómetro no arranca en el pasado).
    const sesion = await this.resolverSesion(actividad.grupoId, tenant);

    if (sesion.retroactiva) {
      throw new CronometroNoRetroactivoException();
    }

    await this.asegurarActividadVisible(actividad, tenant, usuarioId, sesion);

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

    // fase-14-17: arrancar el cronómetro ya es empezarla — que quede en el plan
    // del día aunque no la haya elegido antes (spec, decisión 9).
    await this.planDia.asegurarEnPlan(
      tenant.organizacionId,
      actividad,
      usuarioId,
      sesion.sesionId
    );

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

    const sesion = await this.resolverSesion(actividad.grupoId, tenant, datos.sesionId);

    this.exigirMotivoSiRetroactiva(sesion, datos.motivoRetroactivo);

    // fase-14-33: la visibilidad se evalúa DESPUÉS de resolver la Sesión y no
    // antes, porque el turno rotativo depende del ámbito de esa Sesión — quién
    // tenía el turno el lunes no es quién lo tiene hoy (decisión 4).
    await this.asegurarActividadVisible(actividad, tenant, usuarioId, sesion);

    await this.asegurarProgramacionVigente(actividad, sesion);

    // fase-14-12: una obligatoria que el tutor marcó como no hecha queda
    // bloqueada — el usuario no puede "arreglarla" volviendo a confirmar.
    // fase-14-33: salvo que la haya puesto el cierre automático y quien escribe
    // sea el Tutor — ver `asegurarNoDenegada`.
    await this.levantarCastigoAutomaticoSiCorresponde(actividad, tenant, usuarioId, sesion);
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

    // fase-14-33 (decisión 5): deadline y cronómetro son reglas del INSTANTE, y
    // en una Sesión que ya cerró siempre estarían vencidas — mantenerlas
    // convertiría la carga retroactiva en una pantalla que rechaza todo. Las de
    // la actividad (cupo de repeticiones) y las del DÍA (programación,
    // vigencia, turno) siguen rigiendo enteras, arriba.
    if (actividad.tipoLimiteTiempo === TipoLimiteTiempo.DEADLINE && !sesion.retroactiva) {
      await this.asegurarDeadlineVigente(actividad, sesion, ahora);
    }

    const conCronometro =
      actividad.tipoLimiteTiempo === TipoLimiteTiempo.CRONOMETRO && !sesion.retroactiva;

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
          // fase-14-20: confirmar una obligatoria vale lo que el Tutor haya
          // cargado como premio (0 por default, que es la decisión 2 original
          // del ítem 8 y el comportamiento de toda actividad preexistente).
          valorPuntosSnapshot: esConfirmacion
            ? actividad.puntosPorCumplir
            : actividad.valorPuntos,
          registradoPorId: tenant.principalId,
          registradoPorTipo: tenant.principalType,
          // fase-14-33: null salvo que se esté cargando fuera de su día.
          ...this.marcaRetroactiva(sesion, datos.motivoRetroactivo),
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

    // fase-14-28 (D.1): SIEMPRE se publica, valga 0 puntos o 100. El fase-14-20
    // había puesto acá un guard por `valorPuntosSnapshot !== 0` porque el único
    // consumidor era scoring y un asiento de 0 no aporta nada al ledger. Ahora
    // rewards también escucha, y una actividad de 0 puntos + N monedas es una
    // configuración válida y explícita (decisión 1): con el guard, esa actividad
    // no le llegaría nunca. El evento pasa a significar «esto pasó», no «esto
    // valió puntos» — que es lo correcto para un fan-out por topic exchange: el
    // productor no decide quién necesita enterarse. El descarte del 0 vive ahora
    // en scoring (`ProyeccionService.proyectarRegistro`), que es quien lo usa.
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
        // fase-14-33: sin consumidor todavía; viaja para audit y reportes.
        ...(registro.cargadoRetroactivamenteEn && {
          cargadoRetroactivamenteEn: registro.cargadoRetroactivamenteEn.toISOString(),
        }),
      },
    });

    // fase-14-17: una actividad completada NO puede desaparecer de la lista —
    // tiene que quedar en el tramo "Ya está". Va después del commit y no lanza:
    // el registro ya vale puntos y el plan es solo cómo se ve la pantalla.
    await this.planDia.asegurarEnPlan(
      tenant.organizacionId,
      actividad,
      usuarioId,
      sesion.sesionId
    );

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
    return await this.estadoHoyDe(tenant, grupoId, tenant.principalId);
  }

  /**
   * El mismo estado, para el usuario que se pida — fase-14-23 T4.
   *
   * Lo consume `miEstadoHoy` (con el principal) y el endpoint del Tutor
   * (`GET grupos/:grupoId/usuarios/:usuarioId/estado-hoy`), que necesita ver
   * **exactamente la lista que ve el integrante** para poder marcarla. La
   * alternativa era componerla en el frontend, y eso obligaba a reimplementar
   * en Angular las reglas de visibilidad de cinco ítems (#10, #11, #17, #19,
   * #21): duplicar lógica de negocio en la interfaz, justo lo que este
   * proyecto no hace.
   *
   * `tenant` sigue decidiendo la organización y el grupo; `usuarioId` es solo
   * el sujeto de la consulta. El aislamiento no se afloja: el controlador
   * exige rol de Tutor y el filtro de tenant sigue activo.
   */
  async estadoHoyDe(
    tenant: TenantContext,
    grupoId: string,
    usuarioId: string,
    sesionId?: string
  ): Promise<MiEstadoHoyDto> {
    // fase-14-33: el Tutor puede pedir la lista de otra Sesión de la Sección
    // vigente para corregirla. Un USUARIO nunca llega acá con `sesionId`: su
    // endpoint (`mi-estado-hoy`) no lo acepta.
    return await this.estadoHoyInterno(grupoId, usuarioId, sesionId);
  }

  /**
   * El mismo estado **sin tenant**, para el REST interno (fase-14-31).
   *
   * El cuerpo estaba en `estadoHoyDe` y nunca usó `tenant`: el aislamiento lo
   * pone el controlador (guard de rol + filtro automático), no esta función.
   * Separarlo es lo que evita el atajo de fabricar un `TenantContext` falso en
   * el camino interno — un tenant inventado es exactamente la clase de cosa
   * que después nadie encuentra cuando la regla 3 se rompe.
   */
  async estadoHoyInterno(
    grupoId: string,
    usuarioId: string,
    sesionIdPedido?: string
  ): Promise<MiEstadoHoyDto> {
    const seccion = await this.session.obtenerSeccionActual(grupoId);
    // fase-14-33: la Sesión pedida tiene que ser de la Sección vigente; si no
    // lo es, `sesionAbierta` queda undefined y se devuelve el estado vacío en
    // vez de un error — mismo criterio que "no hay Sesión abierta", que es lo
    // que esta lectura siempre hizo. El 409 lo dan las ESCRITURAS, que son las
    // que tienen que ser tajantes.
    const sesionAbierta = sesionIdPedido
      ? seccion?.sesiones.find((sesion) => sesion.id === sesionIdPedido)
      : seccion?.estado === EstadoSeccion.ABIERTA
        ? seccion.sesiones.find((sesion) => sesion.estado === EstadoSesion.ABIERTA)
        : undefined;

    if (!sesionAbierta) {
      return {
        sesionId: null,
        planDelDiaActivo: false,
        sesionEstado: null,
        sesionNumero: null,
        actividades: [],
      };
    }

    const [actividades, conteos, marcas, planActivo, elegidas] = await Promise.all([
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
      // fase-14-17: el modo del grupo y lo que el integrante ya eligió para hoy.
      this.planDia.estaActivo(grupoId),
      this.planDia.idsElegidos(usuarioId, sesionAbierta.id),
    ]);

    // fase-14-19 + fase-14-24: las actividades que no son para este integrante
    // —por rol, por persona o por equipo— se OCULTAN por completo. El cruce REST
    // hacia identity se paga solo si el catálogo del grupo tiene alguna de esas
    // restricciones: en un grupo que no las usa esto no agrega ni una llamada.
    const contexto = await this.contexto.resolver(grupoId, usuarioId, actividades);
    const destinatarias = actividades.filter((actividad) => esDestinatario(actividad, contexto));

    const vecesPorActividad = new Map(
      conteos.map((conteo) => [conteo.actividadId, conteo._count._all])
    );
    const marcasPorActividad = agruparMarcasPorActividad(marcas);

    // La timezone del Grupo se pide UNA vez por request, y solo si hace falta:
    // para evaluar actividades programadas (fase-14-11), acotadas por fechas
    // (fase-14-24) o para resolver el instante del deadline (fase-14-14). Sin
    // ninguna de las tres no se paga.
    const necesitaTimezone = destinatarias.some(
      (actividad) =>
        tieneProgramacion(actividad) ||
        actividad.tipoLimiteTiempo === TipoLimiteTiempo.DEADLINE
    );
    const timezone = necesitaTimezone
      ? (await this.identity.obtenerGrupo(grupoId))?.timezone
      : undefined;
    const inicioSesion = new Date(sesionAbierta.fechaInicio);

    // fase-14-24, decisión 10: fuera de su rango de fechas la actividad NO se
    // muestra. Es lo contrario del «hoy no toca» del ítem 11 —que sí se ve en
    // gris, porque mañana vuelve—: un rango que terminó no vuelve nunca, y uno
    // que no empezó no dice nada útil todavía. Por eso se filtra acá y no se
    // resuelve con `disponibleHoy`, que sigue significando lo del ítem 11.
    //
    // Sin timezone resuelta no se filtra nada: mismo criterio fail-open que
    // `disponibleHoy` — el servidor decide de verdad al registrar, y esconder
    // actividades por una falla ajena es peor que mostrarlas de más.
    const visibles = timezone
      ? destinatarias.filter(
          (actividad) =>
            motivoNoDisponible(actividad, inicioSesion, timezone) !== 'FUERA_DE_VIGENCIA'
        )
      : destinatarias;

    // fase-14-21: a quién le toca cada obligatoria rotativa hoy. Una consulta
    // para todas (no una por actividad), y ninguna si el grupo no usa turnos.
    const turnosDeHoy = await this.turnosDeLasActividades(
      visibles,
      grupoId,
      sesionAbierta.id,
      sesionAbierta.seccionId,
      usuarioId
    );

    const items: MiEstadoActividadHoyDto[] = visibles.map((actividad) => {
      const vecesHechas = vecesPorActividad.get(actividad.id) ?? 0;
      const esConfirmable =
        actividad.tipoPuntaje === TipoPuntaje.OBLIGATORIA &&
        actividad.comportamientoAlCierre === ComportamientoAlCierre.REQUIERE_CONFIRMACION;
      // fase-14-12: las marcas rojas del tutor sobre esta actividad, hoy.
      const marcasDeLaActividad = marcasPorActividad.get(actividad.id) ?? [];
      const vecesPerdidas = marcasDeLaActividad.filter(
        (marca) => marca.tipo === TipoRegistroActividad.COMPLETADA
      ).length;
      // fase-14-17: con el modo apagado, `requiereSeleccion` es false para
      // todas y `enPlan` viaja true — la home se comporta exactamente como
      // antes del ítem 17 (decisión 12 de la spec).
      const requiereSeleccion = requiereSeleccionDelPlan(actividad, planActivo);

      return {
        actividadId: actividad.id,
        tipoPuntaje: actividad.tipoPuntaje as MiEstadoActividadHoyDto['tipoPuntaje'],
        comportamientoAlCierre:
          actividad.comportamientoAlCierre as MiEstadoActividadHoyDto['comportamientoAlCierre'],
        repeticionesMaximasSesion: actividad.repeticionesMaximasSesion,
        // fase-14-25: 1 salvo que el Tutor haya pedido más confirmaciones.
        repeticionesMinimasSesion: actividad.repeticionesMinimasSesion,
        // fase-14-25: lo que de verdad se le exige hoy. Se recorta contra el
        // tope efectivo por la decisión 14 (una repetición que el tutor quemó
        // baja el mínimo — si no, se castigaría por no llegar a un número al que
        // el servidor ya no deja llegar). Misma cuenta que hace el cierre.
        minimoEfectivo: Math.min(
          actividad.repeticionesMinimasSesion,
          Math.max(0, actividad.repeticionesMaximasSesion - vecesPerdidas)
        ),
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
          ? estaDisponibleEn(actividad, inicioSesion, timezone)
          : true,
        diasSemana: actividad.diasSemana,
        requiereSeleccion,
        enPlan: requiereSeleccion ? elegidas.has(actividad.id) : true,
        // fase-14-21: null = la actividad no rota (es de todos, como siempre).
        turno: turnosDeHoy.get(actividad.id) ?? null,
      };
    });

    return {
      sesionId: sesionAbierta.id,
      planDelDiaActivo: planActivo,
      // fase-14-33: qué Sesión se está mirando. La pantalla del Tutor lo usa
      // para el banner de "estás editando un día que ya cerró".
      sesionEstado: sesionAbierta.estado,
      sesionNumero: sesionAbierta.numero,
      actividades: items,
    };
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

    const sesion = await this.resolverSesion(actividad.grupoId, tenant, datos.sesionId);

    this.exigirMotivoSiRetroactiva(sesion, datos.motivoRetroactivo);

    // Defensa en profundidad: el contenido de integrante es siempre OPCIONAL
    // (fase-14-10, decisión 8), así que acá no debería llegar ninguno — si algún
    // día eso cambia, el dueño sigue siendo el único alcanzado.
    await this.asegurarActividadVisible(actividad, tenant, usuarioId, sesion);

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
        // fase-14-33: distinto de la anterior — ésta explica el día, no la marca.
        ...this.marcaRetroactiva(sesion, datos.motivoRetroactivo),
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
        ...(registro.cargadoRetroactivamenteEn && {
          cargadoRetroactivamenteEn: registro.cargadoRetroactivamenteEn.toISOString(),
        }),
      },
    });

    // Override (fase-14): si la obligatoria era confirmable y el usuario ya la
    // había confirmado, esa confirmación deja de valer — se da de baja para que
    // su pantalla la muestre como NO hecha. El castigo lo aplica el NO_HIZO de
    // arriba, y `paresPendientes` del cierre ya no duplica (hay un registro).
    if (actividad.comportamientoAlCierre === ComportamientoAlCierre.REQUIERE_CONFIRMACION) {
      // fase-14-20: se LEEN antes de darlas de baja. Mientras confirmar valía 0
      // esta baja no tenía asiento que compensar; ahora que puede valer puntos,
      // sin el evento el integrante se quedaría con el premio Y el castigo.
      const confirmaciones = await this.prisma.client.registroActividad.findMany({
        where: {
          usuarioId,
          actividadId,
          sesionId: sesion.sesionId,
          tipo: TipoRegistroActividad.COMPLETADA,
          eliminado: false,
        },
      });

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

      // fase-14-28 (D.1): sin guard por snapshot — la confirmación que se da de
      // baja pudo haber pagado monedas aunque valiera 0 puntos, y rewards tiene
      // que poder revertirlas. El snapshot viaja en el payload para que scoring
      // sepa si hay asiento que compensar (ver `ActividadRegistroEliminado`).
      for (const confirmacion of confirmaciones) {
        await this.eventos.publicar<ActividadRegistroEliminadoPayload>({
          eventType: 'ActividadRegistroEliminado',
          routingKey: ROUTING_KEYS.ACTIVIDAD_REGISTRO_ELIMINADO,
          organizacionId: confirmacion.organizacionId,
          grupoId: confirmacion.grupoId,
          payload: {
            registroId: confirmacion.id,
            usuarioId: confirmacion.usuarioId,
            eliminadoPorTutorId: tenant.principalId,
            valorPuntosSnapshot: confirmacion.valorPuntosSnapshot,
          },
        });
      }
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
    usuarioId: string,
    sesionIdPedido?: string
  ): Promise<MarcaRojaDto[]> {
    const usuarioObjetivo = await this.resolverUsuarioObjetivo(tenant, grupoId, usuarioId);
    const sesionAbierta = await this.sesionDeLectura(grupoId, sesionIdPedido);

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
        // fase-14-33
        cargadoRetroactivamenteEn: marca.cargadoRetroactivamenteEn?.toISOString() ?? null,
        motivoRetroactivo: marca.motivoRetroactivo,
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

    // fase-14-12 decía «la marca vive dentro de su Sesión». fase-14-33 la
    // corrige: vive dentro de su **Sección**, que es la unidad que se evalúa.
    // Mientras la Sección no cerró, deshacer una marca del lunes es parte del
    // trabajo en curso; una vez cerrada, rige la regla 6 sin excepciones.
    //
    // Deshacer NO pide motivo, a diferencia de crear (decisión 7): no agrega
    // una fila que haya que explicar, quita una que no correspondía, y su
    // rastro (`revertidoEn`, `revertidoPorTutorId`) ya queda en la fila.
    await this.asegurarSesionEditable(registro.grupoId, registro.sesionId);

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

    // fase-14-28 (D.1): siempre. Ver el comentario largo en `completar` — una
    // confirmación de 0 puntos puede haber pagado monedas, y restituirlas es
    // justamente lo que rewards escucha acá (decisión 7 de fase-14-28).
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
        valorPuntosSnapshot: registro.valorPuntosSnapshot,
      },
    });

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
    usuarioId: string,
    sesionIdPedido?: string
  ): Promise<CompletadaOpcionalDto[]> {
    const usuarioObjetivo = await this.resolverUsuarioObjetivo(tenant, grupoId, usuarioId);
    const sesionAbierta = await this.sesionDeLectura(grupoId, sesionIdPedido);

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

    // fase-14-33. Dos cambios acá, y el primero es un ENDURECIMIENTO de algo
    // preexistente: este endpoint no validaba la Sesión en absoluto —solo la
    // organización—, así que hasta hoy se podía anular una fila de hace tres
    // Secciones mientras que deshacer esa misma anulación exigía Sesión
    // abierta. Ahora las dos piden lo mismo: Sección vigente.
    const sesion = await this.asegurarSesionEditable(registro.grupoId, registro.sesionId);

    // El segundo: anular algo de un día ya cerrado exige explicarlo. Se usa el
    // `motivo` que el endpoint ya aceptaba —el que el integrante lee— en vez de
    // un campo nuevo: pedirle al Tutor dos textos para el mismo acto sería
    // fricción sin información.
    if (sesion.retroactiva && !motivo?.trim()) {
      throw new MotivoRetroactivoRequeridoException();
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

    // fase-14-28 (D.1): siempre. Ver el comentario largo en `completar`.
    await this.eventos.publicar<ActividadRegistroEliminadoPayload>({
      eventType: 'ActividadRegistroEliminado',
      routingKey: ROUTING_KEYS.ACTIVIDAD_REGISTRO_ELIMINADO,
      organizacionId: registro.organizacionId,
      grupoId: registro.grupoId,
      payload: {
        registroId,
        usuarioId: registro.usuarioId,
        eliminadoPorTutorId: tenant.principalId,
        valorPuntosSnapshot: registro.valorPuntosSnapshot,
      },
    });

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

    const sesion = await this.resolverSesion(conducta.grupoId, tenant, datos.sesionId);

    this.exigirMotivoSiRetroactiva(sesion, datos.motivoRetroactivo);

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
        // fase-14-33
        ...this.marcaRetroactiva(sesion, datos.motivoRetroactivo),
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
        ...(registro.cargadoRetroactivamenteEn && {
          cargadoRetroactivamenteEn: registro.cargadoRetroactivamenteEn.toISOString(),
        }),
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

    // fase-14-33: mismo endurecimiento que en actividades. Sin motivo porque
    // este endpoint nunca aceptó uno — la asimetría de conductas (sin motivo y
    // sin reversión) sigue declarada fuera de alcance desde el #18, y este ítem
    // la hereda tal cual en vez de arreglarla de contrabando.
    await this.asegurarSesionEditable(registro.grupoId, registro.sesionId);

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
  /**
   * fase-14-21: con turno activo, la obligatoria **no es de todos** — solo la
   * registra quien tiene el turno del ámbito vigente (decisiones 6 y 17). Se
   * consulta una sola vez y solo si la actividad rota, así que una actividad sin
   * turnos no paga nada.
   */
  private async asegurarEsSuTurno(
    actividad: Actividad,
    tenant: TenantContext,
    usuarioObjetivo: string,
    sesion: SesionDeRegistro
  ): Promise<void> {
    // Una consulta local barata primero: sin rotación no se paga nada más, que
    // es el caso de todas las actividades anteriores al ítem.
    if (!(await this.turnos.tieneTurnoActivo(actividad.id))) {
      return;
    }

    // fase-14-33: el turno se resuelve con el ámbito de la Sesión ELEGIDA — a
    // quién le tocaba lavar los platos el lunes no es a quién le toca hoy.
    const asignacion = await this.turnos.asignacionVigente(actividad, sesion);

    if (!asignacion) {
      // Rota, pero hoy no se selló turno (día no programado por el #11, o
      // ninguna posición quedó válida): no se le exige a nadie ni se confirma.
      throw new SinTurnoVigenteException();
    }

    if (asignacion.usuarioId === usuarioObjetivo) {
      return;
    }

    if (tenant.rol === Rol.USUARIO) {
      const nombre = (await this.identity.obtenerUsuario(asignacion.usuarioId))?.nombre ?? null;

      throw new NoEsTuTurnoException(nombre);
    }

    throw new NoEsSuTurnoException();
  }

  /**
   * Las TRES reglas de "esta actividad le corresponde hoy a este participante":
   * autoría (fase-14-10), rol (fase-14-19) y turno (fase-14-21). Van juntas
   * porque los tres flujos de registro —cronómetro, completar/confirmar y el
   * "no hizo" del tutor— tienen que aplicar exactamente las mismas.
   *
   * Las dos últimas cuestan consultas, y cada una **solo se paga cuando la
   * actividad efectivamente la usa**: sin roles ni rotación, esto es un chequeo
   * en memoria — que es el caso de todo lo anterior a esos ítems.
   */
  private async asegurarActividadVisible(
    actividad: Actividad,
    tenant: TenantContext,
    usuarioObjetivo: string,
    sesion: SesionDeRegistro
  ): Promise<void> {
    if (!esVisiblePara(actividad, usuarioObjetivo)) {
      if (tenant.rol === Rol.USUARIO) {
        throw new NotFoundException('Actividad no encontrada');
      }

      throw new ActividadPersonalDeOtroUsuarioException();
    }

    await this.asegurarEsDestinatario(actividad, tenant, usuarioObjetivo);
    await this.asegurarEsSuTurno(actividad, tenant, usuarioObjetivo, sesion);
  }

  /**
   * A quién le toca hoy cada actividad rotativa de la lista (fase-14-21). El
   * participante que no tiene el turno igual ve la tarea, sin botón y con «hoy
   * le toca a Ana» (decisión 5) — por eso esto viaja en `mi-estado-hoy` en vez
   * de filtrar la actividad como hace el rol.
   *
   * Costo: una consulta de turnos + una de asignaciones + una de nombres, y
   * **cero** si el grupo no tiene ninguna actividad con rotación.
   */
  private async turnosDeLasActividades(
    actividades: Actividad[],
    grupoId: string,
    sesionId: string,
    seccionId: string,
    usuarioId: string
  ): Promise<Map<string, TurnoDeHoyDto>> {
    const porActividad = new Map<string, TurnoDeHoyDto>();

    const turnos = await this.prisma.client.turnoActividad.findMany({
      where: {
        grupoId,
        activo: true,
        actividadId: { in: actividades.map((actividad) => actividad.id) },
      },
    });

    if (turnos.length === 0) {
      return porActividad;
    }

    const asignaciones = await this.prisma.client.asignacionTurno.findMany({
      where: {
        actividadId: { in: turnos.map((turno) => turno.actividadId) },
        // Cubre las dos frecuencias de una sola vez (SESION y SECCION).
        ambitoId: { in: [sesionId, seccionId] },
      },
    });
    const asignadoPorActividad = new Map(
      asignaciones.map((asignacion) => [asignacion.actividadId, asignacion.usuarioId])
    );

    // Los nombres solo si hay algún turno de OTRO (el propio no se muestra).
    const hayAjeno = asignaciones.some((asignacion) => asignacion.usuarioId !== usuarioId);
    const nombres = hayAjeno
      ? new Map(
          (await this.identity.usuariosDelGrupo(grupoId)).map((usuario) => [
            usuario.id,
            usuario.nombre,
          ])
        )
      : new Map<string, string>();

    for (const turno of turnos) {
      const asignado = asignadoPorActividad.get(turno.actividadId) ?? null;

      porActividad.set(turno.actividadId, {
        usuarioIdAsignado: asignado,
        nombreAsignado: asignado ? (nombres.get(asignado) ?? null) : null,
        esMio: asignado === usuarioId,
      });
    }

    return porActividad;
  }

  /** fase-14-19, extraída para que el turno no quede detrás de un early return. */
  private async asegurarEsDestinatario(
    actividad: Actividad,
    tenant: TenantContext,
    usuarioObjetivo: string
  ): Promise<void> {
    // fase-14-24: sin restricción de ningún tipo, cero llamadas a identity —
    // que es el caso de todo lo anterior a los ítems 19 y 24.
    if (
      actividad.rolesPermitidos.length === 0 &&
      actividad.usuariosPermitidos.length === 0 &&
      actividad.equiposPermitidos.length === 0
    ) {
      return;
    }

    const contexto = await this.contexto.resolver(actividad.grupoId, usuarioObjetivo, [
      actividad,
    ]);

    if (esDestinatario(actividad, contexto)) {
      return;
    }

    // La pantalla ya no la muestra (decisión 6), pero el servidor es el que
    // decide: un cliente con la lista vieja en caché no puede colar el registro.
    if (tenant.rol === Rol.USUARIO) {
      throw new ActividadNoEsDeTuRolException();
    }

    // Vista desde el Tutor: tampoco puede castigar a alguien por una actividad
    // que para él no existe.
    throw new ActividadNoEsDeSuRolException();
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
   * Dónde cae el registro (spec fase-07 validación 3, ampliada por fase-14-33).
   *
   * Sin `sesionIdPedido`: la Sección ABIERTA con Sesión ABIERTA, 409
   * `NO_HAY_SESION_ABIERTA` si no la hay — el comportamiento de siempre.
   *
   * Con `sesionIdPedido`: cualquier Sesión de la Sección **vigente** (ABIERTA o
   * EVALUACION), 409 `SESION_NO_EDITABLE` si no es una de ellas.
   *
   * **Un USUARIO nunca elige Sesión** (decisión 11): el parámetro se descarta
   * antes de mirarlo, igual que `usuarioId` en `completar`. Se resuelve acá y
   * no en el controlador para que ningún camino nuevo pueda saltearlo por
   * olvido — es la misma razón por la que `resolverUsuarioObjetivo` vive acá.
   */
  private async resolverSesion(
    grupoId: string,
    tenant: TenantContext,
    sesionIdPedido?: string
  ): Promise<SesionDeRegistro> {
    const seccion = await this.session.obtenerSeccionActual(grupoId);
    const pedida = tenant.rol === Rol.USUARIO ? undefined : sesionIdPedido;

    return resolverSesionDeTrabajo(seccion, pedida);
  }

  /**
   * La Sesión de una fila que ya existe todavía admite correcciones
   * (fase-14-33): tiene que pertenecer a la Sección vigente.
   *
   * Es el resolvedor de las acciones que **no eligen** Sesión sino que la
   * heredan del registro sobre el que operan (anular, deshacer, anotar). Por
   * eso no recibe un `sesionId` del cliente: lo saca de la fila, que es dato
   * del servidor.
   */
  private async asegurarSesionEditable(
    grupoId: string,
    sesionId: string
  ): Promise<SesionDeRegistro> {
    const seccion = await this.session.obtenerSeccionActual(grupoId);

    if (!seccion?.sesiones.some((sesion) => sesion.id === sesionId)) {
      throw new SesionNoEditableException();
    }

    return resolverSesionDeTrabajo(seccion, sesionId);
  }

  /**
   * La Sesión que mira una LECTURA del Tutor (fase-14-33), o `null`.
   *
   * A diferencia de las escrituras, una Sesión pedida que no existe en la
   * Sección vigente devuelve `null` y no un 409: estas tres lecturas ya
   * devolvían lista vacía cuando no había Sesión abierta, y una pantalla que
   * explota porque el uuid de la URL quedó viejo es peor que una vacía. Las
   * escrituras sí son tajantes — ahí un id equivocado tiene consecuencias.
   */
  private async sesionDeLectura(
    grupoId: string,
    sesionIdPedido?: string
  ): Promise<{ id: string; numero: number; estado: EstadoSesion; seccionId: string } | null> {
    const seccion = await this.session.obtenerSeccionActual(grupoId);

    if (!seccion) {
      return null;
    }

    const elegida = sesionIdPedido
      ? seccion.sesiones.find((sesion) => sesion.id === sesionIdPedido)
      : seccion.estado === EstadoSeccion.ABIERTA
        ? seccion.sesiones.find((sesion) => sesion.estado === EstadoSesion.ABIERTA)
        : undefined;

    return elegida ?? null;
  }

  /**
   * El «no hizo» que puso el CIERRE AUTOMÁTICO no puede bloquear la corrección
   * del Tutor (fase-14-33, decisión 8).
   *
   * Al cerrar una Sesión, fase-14-08 escribe un `NO_HIZO` por cada obligatoria
   * sin confirmar. Si el Tutor entra al día siguiente a cargar la que el chico
   * sí hizo, `asegurarNoDenegada` lo frenaría — y esa es **la corrección más
   * frecuente de todas**, la que motiva este ítem entero. Así que el castigo
   * automático se levanta solo, con su compensación en el ledger.
   *
   * **Un `NO_HIZO` puesto por un Tutor NO se levanta acá**, y la diferencia no
   * es de permisos: uno es un default que el sistema aplicó sin mirar, el otro
   * es el juicio de una persona. Automatizar el segundo se lo borraría sin que
   * se entere; para eso está el botón de deshacer, que es explícito.
   */
  private async levantarCastigoAutomaticoSiCorresponde(
    actividad: Actividad,
    tenant: TenantContext,
    usuarioId: string,
    sesion: SesionDeRegistro
  ): Promise<void> {
    if (tenant.rol === Rol.USUARIO || !sesion.retroactiva) {
      return;
    }

    const automaticos = await this.prisma.client.registroActividad.findMany({
      where: {
        usuarioId,
        actividadId: actividad.id,
        sesionId: sesion.sesionId,
        tipo: TipoRegistroActividad.NO_HIZO,
        eliminado: false,
        registradoPorTipo: 'SYSTEM',
      },
    });

    if (automaticos.length === 0) {
      return;
    }

    const ahora = new Date();

    await this.prisma.client.registroActividad.updateMany({
      where: { id: { in: automaticos.map((fila) => fila.id) } },
      data: {
        eliminado: true,
        eliminadoPorTutorId: tenant.principalId,
        eliminadoEn: ahora,
        revertidoPorTutorId: tenant.principalId,
        revertidoEn: ahora,
      },
    });

    // Misma compensación que `revertirMarca` sobre un NO_HIZO: scoring niega el
    // último asiento de la cadena. Sin esto el integrante se quedaría con el
    // castigo Y el premio, que es el bug silencioso que este ítem podía traer.
    for (const fila of automaticos) {
      await this.eventos.publicar<ActividadRegistroRevertidoPayload>({
        eventType: 'ActividadRegistroRevertido',
        routingKey: ROUTING_KEYS.ACTIVIDAD_REGISTRO_REVERTIDO,
        organizacionId: fila.organizacionId,
        grupoId: fila.grupoId,
        payload: {
          registroId: fila.id,
          usuarioId: fila.usuarioId,
          revertidoPorTutorId: tenant.principalId,
          tipoRegistro: fila.tipo,
          valorPuntosSnapshot: fila.valorPuntosSnapshot,
        },
      });
    }
  }

  /**
   * Escribir en una Sesión que ya cerró exige decir por qué (decisión 7).
   *
   * En la Sesión abierta no pide nada y no valida nada: la inmensa mayoría de
   * los registros son del día, y sumarles fricción por una función que no usan
   * sería pagar el costo del caso raro en el caso común.
   */
  private exigirMotivoSiRetroactiva(
    sesion: SesionDeRegistro,
    motivoRetroactivo?: string
  ): void {
    if (!sesion.retroactiva) {
      return;
    }

    if (!motivoRetroactivo?.trim()) {
      throw new MotivoRetroactivoRequeridoException();
    }
  }

  /**
   * Los dos campos de marca que lleva toda fila escrita fuera de su día
   * (fase-14-33). En la Sesión abierta devuelve los dos en `null`, que es lo
   * que hace que una fila del día siga siendo indistinguible de una anterior a
   * este ítem.
   */
  private marcaRetroactiva(
    sesion: SesionDeRegistro,
    motivoRetroactivo?: string
  ): { cargadoRetroactivamenteEn: Date | null; motivoRetroactivo: string | null } {
    if (!sesion.retroactiva) {
      return { cargadoRetroactivamenteEn: null, motivoRetroactivo: null };
    }

    return {
      cargadoRetroactivamenteEn: new Date(),
      motivoRetroactivo: motivoRetroactivo?.trim() ?? null,
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
    if (!tieneProgramacion(actividad)) {
      return;
    }

    const grupo = await this.identity.obtenerGrupo(actividad.grupoId);

    if (!grupo) {
      throw new NotFoundException('Grupo no encontrado');
    }

    // fase-14-24: días de la semana Y vigencia por fechas.
    const noDisponible = excepcionSiNoDisponible(
      actividad,
      sesion.fechaInicioSesion,
      grupo.timezone
    );

    if (noDisponible) {
      throw noDisponible;
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
