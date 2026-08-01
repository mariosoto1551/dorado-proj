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
 * Un tutor deshizo su propia marca roja (fase-14-12): restauró una completada
 * que había quitado, o dio de baja un "no hizo". scoring compensa negando el
 * ÚLTIMO asiento de la cadena de correcciones del registro, no el original —
 * ver `docs/phases/fase-14-12-marcas-rojas-del-tutor.md`, Parte B.
 */
export interface ActividadRegistroRevertidoPayload {
  registroId: string;
  usuarioId: string;
  revertidoPorTutorId: string;
  /** Decide de qué asiento arranca la cadena (ACTIVIDAD_COMPLETADA o NO_HIZO). */
  tipoRegistro: 'COMPLETADA' | 'NO_HIZO';
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
 * El Tutor anuló una tarea de equipo completada (`TareaEquipoAnulada`) o
 * deshizo esa anulación (`TareaEquipoRevertida`) — fase-14-13. Mismo payload
 * para los dos: scoring hace la MISMA operación en ambos casos (negar el
 * último eslabón de cada cadena), solo cambia el motivo que registra.
 *
 * Ojo: el reparto son **N asientos con el mismo `origenId`**, uno por miembro
 * que recibió puntos. Compensar uno solo dejaría el puntaje mal en silencio.
 */
export interface TareaEquipoMarcaPayload {
  registroTareaEquipoId: string;
  equipoId: string;
  /** El Tutor/ORG_ADMIN que anuló o deshizo (el jefe no puede). */
  tutorId: string;
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

/**
 * Un integrante creó/propuso una actividad propia (fase-14-10). Solo informa a
 * notification: los puntos no entran por acá — una vez ACTIVA, la actividad se
 * completa por el camino normal (ActividadCompletada).
 */
export interface ActividadPropuestaCreadaPayload {
  propuestaId: string;
  organizacionId: string;
  grupoId: string;
  creadaPorUsuarioId: string;
  nombre: string;
  valorPuntos: number;
  /** 'PENDIENTE' (BAJO_APROBACION) | 'APROBADA' (LIBRE, auto-aprobada). */
  estado: string;
  requiereAprobacion: boolean;
  /** id de la Actividad ya creada (modo LIBRE); null si quedó PENDIENTE. */
  actividadId: string | null;
}

/**
 * El Tutor resolvió una propuesta de actividad de un integrante (fase-14-10).
 * `resueltoPorTipo = 'SYSTEM'` corresponde a la auto-aprobación del modo LIBRE
 * (en ese caso notification no avisa al autor: acaba de crearla él).
 */
export interface ActividadPropuestaResueltaPayload {
  propuestaId: string;
  organizacionId: string;
  grupoId: string;
  creadaPorUsuarioId: string;
  nombre: string;
  /** 'APROBADA' | 'RECHAZADA'. */
  estado: string;
  resueltoPorId: string;
  /** 'TUTOR' | 'SYSTEM'. */
  resueltoPorTipo: string;
  actividadId: string | null;
  motivoRechazo: string | null;
}

export interface SesionEventoPayload {
  sesionId: string;
  seccionId: string;
  organizacionId: string;
  grupoId: string;
  numero: number;
  /**
   * ISO del inicio de la Sesión (fase-14-11, agregado). Lo necesita el consumidor
   * de cierre de activity para saber a QUÉ DÍA pertenecía la Sesión (una
   * obligatoria programada solo se castiga el día que le toca) — el reloj del
   * cierre no sirve: la Sesión del martes cierra a las 00:00 del miércoles.
   *
   * Opcional por compatibilidad: un mensaje publicado antes de este cambio no lo
   * trae, y el consumidor tiene un camino explícito para ese caso.
   */
  fechaInicio?: string;
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

/**
 * fase-14-22: el cierre económico de la Sección. UN solo evento cubre las dos
 * notificaciones ("cobraste 12 Doradas" y "te tocó un castigo") porque son el
 * mismo hecho.
 */
export interface MonedasAcreditadasPayload {
  usuarioId: string;
  organizacionId: string;
  grupoId: string;
  seccionId: string;
  nombreZona: string;
  /** Lo que rindió la zona, con signo. */
  monedas: number;
  saldoResultante: number;
  /** No null solo si la bancarrota disparó un castigo (decisión 5). */
  castigo: { recompensaId: string; nombre: string } | null;
}

/** fase-14-22: una compra en la tienda. */
export interface CompraRealizadaPayload {
  compraId: string;
  usuarioId: string;
  organizacionId: string;
  grupoId: string;
  productoId: string;
  nombreProducto: string;
  precio: number;
  /** Cuenta la historia: "te salió" vs "lo elegiste". */
  obtenidoPorAzar: boolean;
  recompensaId: string;
  nombreRecompensa: string;
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
