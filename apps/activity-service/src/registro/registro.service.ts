import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ActividadRegistroEliminadoPayload, ROUTING_KEYS } from '@dorado/shared-events';
import {
  CompletadaOpcionalDto,
  EstadoSeccion,
  EstadoSesion,
  MiEstadoActividadHoyDto,
  MiEstadoHoyDto,
  RegistroActividadDto,
  RegistroConductaDto,
  Rol,
  TenantContext,
} from '@dorado/shared-types';

import { IdentityClientService } from '../clientes/identity-client.service';
import { SessionClientService } from '../clientes/session-client.service';
import { deadlineVencido } from '../comun/deadline';
import {
  CronometroNoIniciadoException,
  CronometroVencidoException,
  DeadlineVencidoException,
  LimiteRepeticionesAlcanzadoException,
  NoHaySesionAbiertaException,
  ObligatoriaNoSeCompletaException,
} from '../comun/excepciones';
import { registroActividadADto, registroConductaADto } from '../comun/mapeadores';
import { EventosPublisherService } from '../eventos/eventos-publisher.service';
import type { Actividad, Conducta } from '../generated/prisma/client';
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
    const sesion = await this.resolverSesionAbierta(actividad.grupoId);
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
    const sesion = await this.resolverSesionAbierta(actividad.grupoId);

    const completadas = await this.prisma.client.registroActividad.count({
      where: {
        usuarioId,
        actividadId,
        sesionId: sesion.sesionId,
        tipo: TipoRegistroActividad.COMPLETADA,
      },
    });

    if (completadas >= actividad.repeticionesMaximasSesion) {
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

    const [actividades, conteos] = await Promise.all([
      this.prisma.client.actividad.findMany({
        where: { grupoId, estado: EstadoCatalogo.ACTIVA },
        orderBy: { createdAt: 'asc' },
      }),
      // vecesHechas: el mismo conteo real que valida `completar` (validación 4).
      // Excluye eliminadas: si un tutor quitó una completada (fase-14), la
      // pantalla del usuario lo refleja al instante.
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
    ]);

    const vecesPorActividad = new Map(
      conteos.map((conteo) => [conteo.actividadId, conteo._count._all])
    );

    const items: MiEstadoActividadHoyDto[] = actividades.map((actividad) => {
      const vecesHechas = vecesPorActividad.get(actividad.id) ?? 0;
      const esConfirmable =
        actividad.tipoPuntaje === TipoPuntaje.OBLIGATORIA &&
        actividad.comportamientoAlCierre === ComportamientoAlCierre.REQUIERE_CONFIRMACION;

      return {
        actividadId: actividad.id,
        tipoPuntaje: actividad.tipoPuntaje as MiEstadoActividadHoyDto['tipoPuntaje'],
        comportamientoAlCierre:
          actividad.comportamientoAlCierre as MiEstadoActividadHoyDto['comportamientoAlCierre'],
        repeticionesMaximasSesion: actividad.repeticionesMaximasSesion,
        vecesHechas,
        confirmada: esConfirmable && vecesHechas > 0,
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
    const sesion = await this.resolverSesionAbierta(actividad.grupoId);

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
      where: { grupoId, estado: EstadoCatalogo.ACTIVA, tipoPuntaje: TipoPuntaje.OPCIONAL },
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
    registroId: string
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

    await this.prisma.client.registroActividad.updateMany({
      where: { id: registroId },
      data: {
        eliminado: true,
        eliminadoPorTutorId: tenant.principalId,
        eliminadoEn: ahora,
      },
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

    return registroActividadADto({
      ...registro,
      eliminado: true,
      eliminadoPorTutorId: tenant.principalId,
      eliminadoEn: ahora,
    });
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
