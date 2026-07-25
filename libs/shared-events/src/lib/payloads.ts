// Payloads de eventos de dominio — fuente de verdad: docs/architecture/event-catalog.md
// No agregar ni quitar campos sin actualizar primero ese documento.

export interface OrganizacionCreadaPayload {
  organizacionId: string;
  nombre: string;
  emailContacto: string;
  /** el ORG_ADMIN recién creado */
  creadaPorTutorId: string;
}

export interface InvitacionGeneradaPayload {
  invitacionId: string;
  organizacionId: string;
  grupoId: string;
  tipoInvitado: 'TUTOR' | 'USUARIO';
  codigo: string;
  /** ISO 8601 */
  expiraEn: string;
  creadoPorTutorId: string;
}

export interface InvitacionCanjeadaPayload {
  invitacionId: string;
  organizacionId: string;
  grupoId: string;
  /** id del Tutor o Usuario creado */
  canjeadaPorId: string;
  tipoInvitado: 'TUTOR' | 'USUARIO';
}

export interface UsuarioUnidoPayload {
  usuarioId: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  invitacionId: string;
}

export interface ActividadCompletadaPayload {
  /** id del RegistroActividad en Activity Catalog */
  registroId: string;
  usuarioId: string;
  actividadId: string;
  sesionId: string;
  seccionId: string;
  /** positivo */
  valorPuntosSnapshot: number;
  registradoPorId: string;
  registradoPorTipo: 'TUTOR' | 'USUARIO';
}

export interface NoHizoRegistradoPayload {
  registroId: string;
  usuarioId: string;
  actividadId: string;
  sesionId: string;
  seccionId: string;
  /** negativo */
  valorPuntosSnapshot: number;
  /** un Tutor (marca manual) o 'SYSTEM' (castigo automático al cierre, fase-14-08) */
  registradoPorId: string;
  registradoPorTipo: 'TUTOR' | 'SYSTEM';
}

export interface ConductaRegistradaPayload {
  registroId: string;
  usuarioId: string;
  conductaId: string;
  tipo: 'BUENA' | 'MALA';
  sesionId: string;
  seccionId: string;
  /** signo según tipo */
  valorPuntosSnapshot: number;
  registradoPorId: string;
  /** USUARIO solo si tipo = MALA (autoreporte) */
  registradoPorTipo: 'TUTOR' | 'USUARIO';
}

export interface ConductaRegistroEliminadoPayload {
  registroId: string;
  usuarioId: string;
  eliminadoPorTutorId: string;
}

/**
 * Un tutor quitó una completada de actividad de un usuario (fase-14: corrección
 * de opcionales, y baja de la confirmación de una obligatoria overrideada por
 * "no hizo"). scoring compensa el asiento original vía `origenId = registroId`.
 */
export interface ActividadRegistroEliminadoPayload {
  registroId: string;
  usuarioId: string;
  eliminadoPorTutorId: string;
}

/**
 * Una tarea de equipo (Actividad alcance=EQUIPO) fue completada por el jefe
 * (fase-14-09). scoring reparte creando un EventoPuntos por cada asignación,
 * etiquetado con equipoId. `asignaciones` ya trae el signo/valor resuelto
 * (base + bono del jefe) para que scoring no recalcule.
 */
export interface TareaEquipoCompletadaPayload {
  /** id del RegistroTareaEquipo en Activity Catalog. */
  registroTareaEquipoId: string;
  actividadId: string;
  equipoId: string;
  organizacionId: string;
  grupoId: string;
  sesionId: string;
  seccionId: string;
  completadaPorId: string;
  completadaPorTipo: 'USUARIO' | 'TUTOR';
  asignaciones: Array<{ usuarioId: string; puntos: number; esJefe: boolean }>;
}

/**
 * El jefe de un equipo reportó a un integrante por una conducta MALA concreta
 * (fase-14-09). Solo informa a notification; el descuento se aplica cuando el
 * Tutor aprueba (que reutiliza ConductaRegistrada).
 */
export interface ReporteMiembroCreadoPayload {
  reporteId: string;
  organizacionId: string;
  grupoId: string;
  equipoId: string;
  reportadoUsuarioId: string;
  jefeUsuarioId: string;
  conductaId: string;
}

export interface SesionEventoPayload {
  sesionId: string;
  seccionId: string;
  organizacionId: string;
  grupoId: string;
  numero: number;
}

export interface SeccionEventoPayload {
  seccionId: string;
  organizacionId: string;
  grupoId: string;
  numero: number;
}

export interface ZonaAlcanzadaPayload {
  usuarioId: string;
  seccionId: string;
  organizacionId: string;
  grupoId: string;
  puntajeTotal: number;
  umbralZonaId: string;
  nombreZona: string;
  /**
   * true = disparado por SeccionEntroEvaluacion (el que usa Rewards para
   * habilitar canje). false = disparado por SesionCerrada cuando
   * evaluarUmbralesEn=CADA_SESION (solo informativo/notificación, no habilita
   * recompensas).
   */
  esEvaluacionFinal: boolean;
}

export interface UsuarioDescalificadoPayload {
  usuarioId: string;
  seccionId: string;
  organizacionId: string;
  grupoId: string;
  motivo: string;
  registradaPorTutorId: string;
}

export interface RecompensaCanjeadaPayload {
  canjeId: string;
  usuarioId: string;
  seccionId: string;
  recompensaId: string;
  mecanica: 'SELECCION' | 'AZAR';
  organizacionId: string;
  grupoId: string;
}

export interface AccionAdministrativaRegistradaPayload {
  actorId: string;
  actorTipo: 'TUTOR' | 'USUARIO' | 'PLATFORM_ADMIN' | 'SYSTEM';
  /** ej. 'ACTIVIDAD_EDITADA', 'UMBRAL_CREADO' */
  accion: string;
  /** ej. 'Actividad' */
  entidadTipo: string;
  entidadId: string;
  /** snapshot antes/después, libre por servicio */
  detalle: Record<string, unknown>;
}
