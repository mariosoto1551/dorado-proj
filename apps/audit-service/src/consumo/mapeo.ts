import type {
  AccionAdministrativaRegistradaPayload,
  ConductaRegistroEliminadoPayload,
  EventEnvelope,
  InvitacionCanjeadaPayload,
  OrganizacionCreadaPayload,
  RecompensaCanjeadaPayload,
  SeccionEventoPayload,
  SesionEventoPayload,
  UsuarioDescalificadoPayload,
  UsuarioUnidoPayload,
} from '@dorado/shared-events';

/** Fila de RegistroAuditoria lista para persistir (sin id/createdAt). */
export interface FilaAuditoria {
  organizacionId: string;
  grupoId: string | null;
  actorId: string;
  actorTipo: string;
  accion: string;
  entidadTipo: string;
  entidadId: string;
  detalle: Record<string, unknown>;
}

/**
 * Mapea cada evento consumido a su fila de auditoría (spec fase-09 Parte C):
 * `detalle` es SIEMPRE el payload completo tal cual llegó. Los eventos de
 * ciclo de vida de Sesión/Sección se atribuyen a SYSTEM (los dispara la
 * máquina de estados/scheduler de session, no un actor puntual — el payload
 * no trae actor a propósito). Función pura: fácil de testear.
 */
export function mapearARegistro(envelope: EventEnvelope<unknown>): FilaAuditoria {
  const base = {
    organizacionId: envelope.organizacionId,
    grupoId: envelope.grupoId ?? null,
    detalle: envelope.payload as Record<string, unknown>,
  };

  switch (envelope.eventType) {
    case 'AccionAdministrativaRegistrada': {
      const payload = envelope.payload as AccionAdministrativaRegistradaPayload;

      return {
        ...base,
        actorId: payload.actorId,
        actorTipo: payload.actorTipo,
        accion: payload.accion,
        entidadTipo: payload.entidadTipo,
        entidadId: payload.entidadId,
        detalle: payload.detalle,
      };
    }
    case 'OrganizacionCreada': {
      const payload = envelope.payload as OrganizacionCreadaPayload;

      return {
        ...base,
        grupoId: null,
        actorId: payload.creadaPorTutorId,
        actorTipo: 'TUTOR',
        accion: 'ORGANIZACION_CREADA',
        entidadTipo: 'Organizacion',
        entidadId: payload.organizacionId,
      };
    }
    case 'InvitacionCanjeada': {
      const payload = envelope.payload as InvitacionCanjeadaPayload;

      return {
        ...base,
        grupoId: payload.grupoId,
        actorId: payload.canjeadaPorId,
        actorTipo: payload.tipoInvitado,
        accion: 'INVITACION_CANJEADA',
        entidadTipo: 'Invitacion',
        entidadId: payload.invitacionId,
      };
    }
    case 'UsuarioUnido': {
      const payload = envelope.payload as UsuarioUnidoPayload;

      return {
        ...base,
        grupoId: payload.grupoId,
        actorId: payload.usuarioId,
        actorTipo: 'USUARIO',
        accion: 'USUARIO_UNIDO',
        entidadTipo: 'Usuario',
        entidadId: payload.usuarioId,
      };
    }
    case 'ConductaRegistroEliminado': {
      const payload = envelope.payload as ConductaRegistroEliminadoPayload;

      return {
        ...base,
        actorId: payload.eliminadoPorTutorId,
        actorTipo: 'TUTOR',
        accion: 'CONDUCTA_REGISTRO_ELIMINADO',
        entidadTipo: 'RegistroConducta',
        entidadId: payload.registroId,
      };
    }
    case 'UsuarioDescalificado': {
      const payload = envelope.payload as UsuarioDescalificadoPayload;

      // Entidad = el Usuario (criterio 4: su timeline responde "¿por qué me
      // descalificaron?" — el motivo queda en detalle).
      return {
        ...base,
        grupoId: payload.grupoId,
        actorId: payload.registradaPorTutorId,
        actorTipo: 'TUTOR',
        accion: 'USUARIO_DESCALIFICADO',
        entidadTipo: 'Usuario',
        entidadId: payload.usuarioId,
      };
    }
    case 'RecompensaCanjeada': {
      const payload = envelope.payload as RecompensaCanjeadaPayload;

      return {
        ...base,
        grupoId: payload.grupoId,
        actorId: payload.usuarioId,
        actorTipo: 'USUARIO',
        accion: 'RECOMPENSA_CANJEADA',
        entidadTipo: 'CanjeRecompensa',
        entidadId: payload.canjeId,
      };
    }
    case 'SesionAbierta':
    case 'SesionCerrada': {
      const payload = envelope.payload as SesionEventoPayload;

      return {
        ...base,
        grupoId: payload.grupoId,
        actorId: 'session-service',
        actorTipo: 'SYSTEM',
        accion: aAccion(envelope.eventType),
        entidadTipo: 'Sesion',
        entidadId: payload.sesionId,
      };
    }
    case 'SeccionAbierta':
    case 'SeccionEntroEvaluacion':
    case 'SeccionCerrada': {
      const payload = envelope.payload as SeccionEventoPayload;

      return {
        ...base,
        grupoId: payload.grupoId,
        actorId: 'session-service',
        actorTipo: 'SYSTEM',
        accion: aAccion(envelope.eventType),
        entidadTipo: 'Seccion',
        entidadId: payload.seccionId,
      };
    }
    default:
      throw new Error(`eventType inesperado en cola de audit: ${envelope.eventType}`);
  }
}

/** 'SeccionEntroEvaluacion' -> 'SECCION_ENTRO_EVALUACION' */
function aAccion(eventType: string): string {
  return eventType.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}
