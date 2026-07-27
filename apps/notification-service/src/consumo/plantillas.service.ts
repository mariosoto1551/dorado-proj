import { Injectable } from '@nestjs/common';

import type {
  ActividadPropuestaCreadaPayload,
  ActividadPropuestaResueltaPayload,
  ConductaRegistradaPayload,
  ConductaRegistroEliminadoPayload,
  EventEnvelope,
  InvitacionGeneradaPayload,
  NoHizoRegistradoPayload,
  RecompensaCanjeadaPayload,
  ReporteMiembroCreadoPayload,
  SeccionEventoPayload,
  UsuarioDescalificadoPayload,
  UsuarioUnidoPayload,
  ZonaAlcanzadaPayload,
} from '@dorado/shared-events';

import { ActivityClientService } from '../clientes/activity-client.service';
import { IdentityClientService } from '../clientes/identity-client.service';

/** Fila de Notificacion lista para persistir (sin id/leida/createdAt). */
export interface NotificacionAPersistir {
  organizacionId: string;
  grupoId: string;
  destinatarioId: string;
  destinatarioTipo: 'TUTOR' | 'USUARIO';
  tipo: string;
  mensaje: string;
}

/**
 * Plantillas de la tabla de la spec fase-09: decide destinatarios y arma el
 * mensaje de cada evento. Los nombres legibles se resuelven acá por REST
 * interno (los payloads solo traen IDs a propósito — no acoplar); si el dueño
 * del dato responde 404 se usa un texto de fallback: mejor una notificación
 * genérica que un mensaje perdido en la DLQ por un detalle cosmético.
 */
@Injectable()
export class PlantillasService {
  constructor(
    private readonly identity: IdentityClientService,
    private readonly activity: ActivityClientService
  ) {}

  /**
   * Filas a crear para el envelope, o `[]` si el evento no genera
   * notificaciones (ej. ZonaAlcanzada intermedia — se descarta explícito).
   */
  async armar(envelope: EventEnvelope<unknown>): Promise<NotificacionAPersistir[]> {
    switch (envelope.eventType) {
      case 'InvitacionGenerada':
        return await this.invitacionGenerada(envelope as EventEnvelope<InvitacionGeneradaPayload>);
      case 'UsuarioUnido':
        return await this.usuarioUnido(envelope as EventEnvelope<UsuarioUnidoPayload>);
      case 'NoHizoRegistrado':
        return await this.noHizoRegistrado(envelope as EventEnvelope<NoHizoRegistradoPayload>);
      case 'ConductaRegistrada':
        return await this.conductaRegistrada(envelope as EventEnvelope<ConductaRegistradaPayload>);
      case 'ConductaRegistroEliminado':
        return this.conductaEliminada(envelope as EventEnvelope<ConductaRegistroEliminadoPayload>);
      case 'SeccionEntroEvaluacion':
        return await this.seccionEntroEvaluacion(envelope as EventEnvelope<SeccionEventoPayload>);
      case 'ZonaAlcanzada':
        return this.zonaAlcanzada(envelope as EventEnvelope<ZonaAlcanzadaPayload>);
      case 'UsuarioDescalificado':
        return await this.usuarioDescalificado(envelope as EventEnvelope<UsuarioDescalificadoPayload>);
      case 'RecompensaCanjeada':
        return await this.recompensaCanjeada(envelope as EventEnvelope<RecompensaCanjeadaPayload>);
      case 'ReporteMiembroCreado':
        return await this.reporteMiembroCreado(
          envelope as EventEnvelope<ReporteMiembroCreadoPayload>
        );
      case 'ActividadPropuestaCreada':
        return await this.actividadPropuestaCreada(
          envelope as EventEnvelope<ActividadPropuestaCreadaPayload>
        );
      case 'ActividadPropuestaResuelta':
        return this.actividadPropuestaResuelta(
          envelope as EventEnvelope<ActividadPropuestaResueltaPayload>
        );
      default:
        throw new Error(`eventType inesperado en cola de notification: ${envelope.eventType}`);
    }
  }

  /** "Tutores del grupo (excepto quien la generó)". */
  private async invitacionGenerada(
    envelope: EventEnvelope<InvitacionGeneradaPayload>
  ): Promise<NotificacionAPersistir[]> {
    const { grupoId, tipoInvitado, creadoPorTutorId } = envelope.payload;
    const tutores = await this.identity.tutoresDelGrupo(grupoId);

    return tutores
      .filter((tutor) => tutor.id !== creadoPorTutorId)
      .map((tutor) => ({
        organizacionId: envelope.organizacionId,
        grupoId,
        destinatarioId: tutor.id,
        destinatarioTipo: 'TUTOR' as const,
        tipo: 'INVITACION_GENERADA',
        mensaje: `Se generó una invitación de ${tipoInvitado} para el grupo.`,
      }));
  }

  private async usuarioUnido(
    envelope: EventEnvelope<UsuarioUnidoPayload>
  ): Promise<NotificacionAPersistir[]> {
    const { grupoId, nombre } = envelope.payload;
    const tutores = await this.identity.tutoresDelGrupo(grupoId);

    return tutores.map((tutor) => ({
      organizacionId: envelope.organizacionId,
      grupoId,
      destinatarioId: tutor.id,
      destinatarioTipo: 'TUTOR' as const,
      tipo: 'USUARIO_UNIDO',
      mensaje: `${nombre} se unió al grupo.`,
    }));
  }

  private async noHizoRegistrado(
    envelope: EventEnvelope<NoHizoRegistradoPayload>
  ): Promise<NotificacionAPersistir[]> {
    const actividad = await this.activity.obtenerActividad(envelope.payload.actividadId);

    return [
      {
        organizacionId: envelope.organizacionId,
        grupoId: this.grupoDelEnvelope(envelope),
        destinatarioId: envelope.payload.usuarioId,
        destinatarioTipo: 'USUARIO',
        tipo: 'NO_HIZO_REGISTRADO',
        mensaje: `Se registró que no hiciste: ${actividad?.nombre ?? 'una actividad'}.`,
      },
    ];
  }

  /** Solo si lo registró un TUTOR — el autoreporte no se auto-notifica (spec). */
  private async conductaRegistrada(
    envelope: EventEnvelope<ConductaRegistradaPayload>
  ): Promise<NotificacionAPersistir[]> {
    if (envelope.payload.registradoPorTipo !== 'TUTOR') {
      return [];
    }

    const conducta = await this.activity.obtenerConducta(envelope.payload.conductaId);

    return [
      {
        organizacionId: envelope.organizacionId,
        grupoId: this.grupoDelEnvelope(envelope),
        destinatarioId: envelope.payload.usuarioId,
        destinatarioTipo: 'USUARIO',
        tipo: 'CONDUCTA_REGISTRADA',
        mensaje: `Se registró una conducta ${envelope.payload.tipo}: ${
          conducta?.nombre ?? 'sin nombre'
        }.`,
      },
    ];
  }

  private conductaEliminada(
    envelope: EventEnvelope<ConductaRegistroEliminadoPayload>
  ): NotificacionAPersistir[] {
    return [
      {
        organizacionId: envelope.organizacionId,
        grupoId: this.grupoDelEnvelope(envelope),
        destinatarioId: envelope.payload.usuarioId,
        destinatarioTipo: 'USUARIO',
        tipo: 'CONDUCTA_REGISTRO_ELIMINADO',
        mensaje: 'Un tutor eliminó un registro de conducta tuyo.',
      },
    ];
  }

  /** Dos audiencias con mensajes distintos (spec). */
  private async seccionEntroEvaluacion(
    envelope: EventEnvelope<SeccionEventoPayload>
  ): Promise<NotificacionAPersistir[]> {
    const { grupoId } = envelope.payload;
    const [usuarios, tutores] = await Promise.all([
      this.identity.usuariosDelGrupo(grupoId),
      this.identity.tutoresDelGrupo(grupoId),
    ]);

    return [
      ...usuarios.map((usuario) => ({
        organizacionId: envelope.organizacionId,
        grupoId,
        destinatarioId: usuario.id,
        destinatarioTipo: 'USUARIO' as const,
        tipo: 'SECCION_ENTRO_EVALUACION',
        mensaje: '¡Terminó la semana! Ya podés ver tu resultado.',
      })),
      ...tutores.map((tutor) => ({
        organizacionId: envelope.organizacionId,
        grupoId,
        destinatarioId: tutor.id,
        destinatarioTipo: 'TUTOR' as const,
        tipo: 'SECCION_ENTRO_EVALUACION',
        mensaje: 'La Sección entró en evaluación, revisá los resultados.',
      })),
    ];
  }

  /** Solo esEvaluacionFinal=true (spec) — la intermedia se descarta acá. */
  private zonaAlcanzada(envelope: EventEnvelope<ZonaAlcanzadaPayload>): NotificacionAPersistir[] {
    if (!envelope.payload.esEvaluacionFinal) {
      return [];
    }

    return [
      {
        organizacionId: envelope.organizacionId,
        grupoId: envelope.payload.grupoId,
        destinatarioId: envelope.payload.usuarioId,
        destinatarioTipo: 'USUARIO',
        tipo: 'ZONA_ALCANZADA',
        mensaje: `Llegaste a la zona ${envelope.payload.nombreZona} esta Sección.`,
      },
    ];
  }

  private async usuarioDescalificado(
    envelope: EventEnvelope<UsuarioDescalificadoPayload>
  ): Promise<NotificacionAPersistir[]> {
    const { usuarioId, grupoId, motivo } = envelope.payload;
    const [usuario, tutores] = await Promise.all([
      this.identity.obtenerUsuario(usuarioId),
      this.identity.tutoresDelGrupo(grupoId),
    ]);
    const nombreUsuario = usuario?.nombre ?? 'Un usuario';

    return [
      {
        organizacionId: envelope.organizacionId,
        grupoId,
        destinatarioId: usuarioId,
        destinatarioTipo: 'USUARIO',
        tipo: 'USUARIO_DESCALIFICADO',
        mensaje: `Fuiste descalificado de esta Sección: ${motivo}.`,
      },
      ...tutores.map((tutor) => ({
        organizacionId: envelope.organizacionId,
        grupoId,
        destinatarioId: tutor.id,
        destinatarioTipo: 'TUTOR' as const,
        tipo: 'USUARIO_DESCALIFICADO',
        mensaje: `${nombreUsuario} fue descalificado: ${motivo}.`,
      })),
    ];
  }

  private async recompensaCanjeada(
    envelope: EventEnvelope<RecompensaCanjeadaPayload>
  ): Promise<NotificacionAPersistir[]> {
    const { usuarioId, grupoId } = envelope.payload;
    const [usuario, tutores] = await Promise.all([
      this.identity.obtenerUsuario(usuarioId),
      this.identity.tutoresDelGrupo(grupoId),
    ]);
    const nombreUsuario = usuario?.nombre ?? 'Un usuario';

    return tutores.map((tutor) => ({
      organizacionId: envelope.organizacionId,
      grupoId,
      destinatarioId: tutor.id,
      destinatarioTipo: 'TUTOR' as const,
      tipo: 'RECOMPENSA_CANJEADA',
      mensaje: `${nombreUsuario} canjeó una recompensa, pendiente de entrega.`,
    }));
  }

  /** El jefe reportó a un integrante (fase-14-09): notifica a los tutores del grupo. */
  private async reporteMiembroCreado(
    envelope: EventEnvelope<ReporteMiembroCreadoPayload>
  ): Promise<NotificacionAPersistir[]> {
    const { grupoId, reportadoUsuarioId } = envelope.payload;
    const [reportado, tutores] = await Promise.all([
      this.identity.obtenerUsuario(reportadoUsuarioId),
      this.identity.tutoresDelGrupo(grupoId),
    ]);
    const nombre = reportado?.nombre ?? 'un integrante';

    return tutores.map((tutor) => ({
      organizacionId: envelope.organizacionId,
      grupoId,
      destinatarioId: tutor.id,
      destinatarioTipo: 'TUTOR' as const,
      tipo: 'REPORTE_MIEMBRO_CREADO',
      mensaje: `El jefe de equipo reportó a ${nombre} — revisá el reporte para aprobarlo o rechazarlo.`,
    }));
  }

  /**
   * Un integrante creó/propuso una actividad propia (fase-14-10): notifica a los
   * tutores del grupo. El texto distingue los dos modos — en `BAJO_APROBACION`
   * hay algo que hacer (revisar), en `LIBRE` es informativo, pero se avisa igual:
   * el Tutor tiene que poder enterarse sin entrar a mirar.
   */
  private async actividadPropuestaCreada(
    envelope: EventEnvelope<ActividadPropuestaCreadaPayload>
  ): Promise<NotificacionAPersistir[]> {
    const { grupoId, creadaPorUsuarioId, nombre, valorPuntos, requiereAprobacion } =
      envelope.payload;
    const [autor, tutores] = await Promise.all([
      this.identity.obtenerUsuario(creadaPorUsuarioId),
      this.identity.tutoresDelGrupo(grupoId),
    ]);
    const nombreAutor = autor?.nombre ?? 'Un integrante';
    const mensaje = requiereAprobacion
      ? `${nombreAutor} propuso la actividad «${nombre}» (${valorPuntos} pts) — revisala para aprobarla o rechazarla.`
      : `${nombreAutor} creó la actividad «${nombre}» (${valorPuntos} pts).`;

    return tutores.map((tutor) => ({
      organizacionId: envelope.organizacionId,
      grupoId,
      destinatarioId: tutor.id,
      destinatarioTipo: 'TUTOR' as const,
      tipo: 'ACTIVIDAD_PROPUESTA_CREADA',
      mensaje,
    }));
  }

  /**
   * El Tutor resolvió la propuesta (fase-14-10): avisa al autor. La
   * auto-aprobación del modo LIBRE (`SYSTEM`) no se notifica — el integrante
   * acaba de crearla, ya lo sabe.
   */
  private actividadPropuestaResuelta(
    envelope: EventEnvelope<ActividadPropuestaResueltaPayload>
  ): NotificacionAPersistir[] {
    const { grupoId, creadaPorUsuarioId, nombre, estado, resueltoPorTipo, motivoRechazo } =
      envelope.payload;

    if (resueltoPorTipo === 'SYSTEM') {
      return [];
    }

    const mensaje =
      estado === 'APROBADA'
        ? `Tu actividad «${nombre}» fue aprobada — ya la podés marcar como hecha.`
        : `Tu actividad «${nombre}» fue rechazada${motivoRechazo ? `: ${motivoRechazo}` : '.'}`;

    return [
      {
        organizacionId: envelope.organizacionId,
        grupoId,
        destinatarioId: creadaPorUsuarioId,
        destinatarioTipo: 'USUARIO',
        tipo: 'ACTIVIDAD_PROPUESTA_RESUELTA',
        mensaje,
      },
    ];
  }

  private grupoDelEnvelope(envelope: EventEnvelope<unknown>): string {
    if (!envelope.grupoId) {
      throw new Error(
        `Envelope ${envelope.eventId} (${envelope.eventType}) sin grupoId — no se puede notificar`
      );
    }

    return envelope.grupoId;
  }
}
