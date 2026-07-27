// Topología RabbitMQ — fuente de verdad: docs/architecture/ADR-00 sección 5
// y docs/architecture/event-catalog.md (tabla de eventos).

/** Exchange topic único de eventos de dominio. */
export const EXCHANGE_DORADO_EVENTS = 'dorado.events';

/** Dead-letter exchange (topic) para mensajes que agotan reintentos. */
export const EXCHANGE_DORADO_EVENTS_DLX = 'dorado.events.dlx';

export const ROUTING_KEYS = {
  ORGANIZACION_CREADA: 'identity.organizacion_creada',
  INVITACION_GENERADA: 'identity.invitacion_generada',
  INVITACION_CANJEADA: 'identity.invitacion_canjeada',
  USUARIO_UNIDO: 'identity.usuario_unido',
  ACTIVIDAD_COMPLETADA: 'activity.actividad_completada',
  NO_HIZO_REGISTRADO: 'activity.no_hizo_registrado',
  CONDUCTA_REGISTRADA: 'activity.conducta_registrada',
  CONDUCTA_REGISTRO_ELIMINADO: 'activity.conducta_registro_eliminado',
  ACTIVIDAD_REGISTRO_ELIMINADO: 'activity.actividad_registro_eliminado',
  ACTIVIDAD_REGISTRO_REVERTIDO: 'activity.actividad_registro_revertido',
  TAREA_EQUIPO_COMPLETADA: 'activity.tarea_equipo_completada',
  TAREA_EQUIPO_ANULADA: 'activity.tarea_equipo_anulada',
  TAREA_EQUIPO_REVERTIDA: 'activity.tarea_equipo_revertida',
  REPORTE_MIEMBRO_CREADO: 'activity.reporte_miembro_creado',
  ACTIVIDAD_PROPUESTA_CREADA: 'activity.actividad_propuesta_creada',
  ACTIVIDAD_PROPUESTA_RESUELTA: 'activity.actividad_propuesta_resuelta',
  SESION_ABIERTA: 'session.sesion_abierta',
  SESION_CERRADA: 'session.sesion_cerrada',
  SECCION_ABIERTA: 'session.seccion_abierta',
  SECCION_ENTRO_EVALUACION: 'session.seccion_entro_evaluacion',
  SECCION_CERRADA: 'session.seccion_cerrada',
  ZONA_ALCANZADA: 'scoring.zona_alcanzada',
  USUARIO_DESCALIFICADO: 'scoring.usuario_descalificado',
  RECOMPENSA_CANJEADA: 'rewards.recompensa_canjeada',
} as const;

export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];

/**
 * `AccionAdministrativaRegistrada` es un evento genérico cuyo routing key
 * depende del servicio productor: `<servicio>.accion_administrativa`.
 * Ej.: accionAdministrativaRoutingKey('identity') => 'identity.accion_administrativa'.
 */
export function accionAdministrativaRoutingKey(servicioProductor: string): string {
  return `${servicioProductor}.accion_administrativa`;
}
