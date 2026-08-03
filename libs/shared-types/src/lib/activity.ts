import { PrincipalType } from './auth';
import { EstadoSesion } from './session';

export enum TipoPuntaje {
  OPCIONAL = 'OPCIONAL',
  OBLIGATORIA = 'OBLIGATORIA',
}

export enum TipoLimiteTiempo {
  DEADLINE = 'DEADLINE',
  CRONOMETRO = 'CRONOMETRO',
  SIN_LIMITE = 'SIN_LIMITE',
}

export enum TipoConducta {
  BUENA = 'BUENA',
  MALA = 'MALA',
}

/**
 * Comportamiento de una actividad OBLIGATORIA al cerrar la Sesión (fase-14-08).
 * Solo tiene sentido con tipoPuntaje = OBLIGATORIA; para OPCIONAL se fuerza a
 * ASUME_HECHA.
 */
export enum ComportamientoAlCierre {
  /** Comportamiento clásico: sin registro positivo, sin castigo automático. */
  ASUME_HECHA = 'ASUME_HECHA',
  /** El Usuario debe confirmar; si no, no-hizo automático al cerrar la Sesión. */
  REQUIERE_CONFIRMACION = 'REQUIERE_CONFIRMACION',
}

/**
 * Alcance de una actividad (fase-14-09). INDIVIDUAL = clásico (cada usuario la
 * completa para sí). EQUIPO = la completa el jefe una vez y scoring reparte a
 * los miembros. Las de equipo son siempre OPCIONAL en esta fase.
 */
export enum AlcanceActividad {
  INDIVIDUAL = 'INDIVIDUAL',
  EQUIPO = 'EQUIPO',
}

/**
 * Quién creó la actividad (fase-14-10). TUTOR = comportamiento clásico (del
 * catálogo del grupo, visible para todos). USUARIO = actividad PERSONAL de su
 * autor: solo él la ve y la completa (los tutores la ven para moderar).
 */
export enum OrigenActividad {
  TUTOR = 'TUTOR',
  USUARIO = 'USUARIO',
}

export interface ActividadDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  descripcion: string | null;
  tipoPuntaje: TipoPuntaje;
  /** En una OBLIGATORIA es el CASTIGO por no hacerla; en una OPCIONAL, el premio. */
  valorPuntos: number;
  /**
   * fase-14-20: lo que suma CUMPLIR una obligatoria confirmable (ej. +2 contra
   * un castigo de −10). 0 fuera de OBLIGATORIA + REQUIERE_CONFIRMACION, y 0 en
   * toda actividad anterior al ítem — con 0, confirmar no toca el ledger.
   */
  puntosPorCumplir: number;
  tipoLimiteTiempo: TipoLimiteTiempo;
  deadlineHora: string | null;
  duracionCronometroMinutos: number | null;
  repeticionesMaximasSesion: number;
  repeticionesMaximasSeccion: number | null;
  comportamientoAlCierre: ComportamientoAlCierre;
  alcance: AlcanceActividad;
  /** Puntos extra al jefe sobre el valor base; solo relevante si alcance = EQUIPO. */
  bonoJefePuntos: number;
  /** fase-14-10: TUTOR (catálogo del grupo) o USUARIO (personal de su autor). */
  origen: OrigenActividad;
  /** Autor y dueño si origen = USUARIO; null si la creó un tutor. */
  creadaPorUsuarioId: string | null;
  /**
   * fase-14-11: días de la semana en que se puede registrar
   * (0 = domingo … 6 = sábado). Vacío = todos los días.
   */
  diasSemana: number[];
  /**
   * fase-14-17: la opcional aparece en la lista del integrante sin que él la
   * elija (y no se ofrece en la hoja «Elegir»: ya está). Solo tiene efecto con
   * `planDelDiaActivo` en el Grupo, y solo en OPCIONAL + INDIVIDUAL.
   */
  siempreVisible: boolean;
  /**
   * fase-14-19: ids de `RolGrupo` (identity) que pueden verla y registrarla.
   * Vacío = la ven todos, que es el default. Un participante cuyo rol no esté en
   * la lista NO la ve (decisión 6: se oculta, no se muestra deshabilitada).
   * Solo aplica a actividades INDIVIDUAL del catálogo del Tutor.
   */
  rolesPermitidos: string[];
  /**
   * fase-14-24: destinatario NOMINAL — ids de `Usuario` (identity). Vacío = no
   * es el modo activo. Excluyente con `rolesPermitidos` y `equiposPermitidos`:
   * los cuatro modos (todos / rol / personas / equipos) no se combinan.
   *
   * La diferencia con el rol es de intención, no de mecánica: el rol es
   * **dinámico** (quien lo reciba mañana queda incluido solo), esta lista es
   * **estática** (quien entre al grupo mañana no entra a la lista).
   *
   * Quien no es destinatario NO la ve — se oculta, igual que con el rol.
   */
  usuariosPermitidos: string[];
  /** fase-14-24: ids de `Equipo` (identity). Solo con `alcance = EQUIPO`. */
  equiposPermitidos: string[];
  /**
   * fase-14-24: vigencia. Fecha CIVIL `"YYYY-MM-DD"` del calendario local del
   * Grupo, no un instante — misma convención que `deadlineHora` con `"HH:mm"`.
   * Ambos extremos son inclusivos, así que `desde = hasta` es "solo ese día".
   * Los dos en null = permanente, que es el default.
   *
   * Se cruza con `diasSemana`: "los lunes y miércoles, del 1 al 30 de marzo"
   * exige cumplir las dos condiciones.
   */
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  estado: 'ACTIVA' | 'ARCHIVADA';
}

export interface ConductaDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  nombre: string;
  tipo: TipoConducta;
  valorPuntos: number;
  permiteAutoreporte: boolean;
  estado: 'ACTIVA' | 'ARCHIVADA';
}

export interface RegistroActividadDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  actividadId: string;
  sesionId: string;
  seccionId: string;
  tipo: 'COMPLETADA' | 'NO_HIZO';
  valorPuntosSnapshot: number;
  registradoPorId: string;
  registradoPorTipo: PrincipalType;
  /** fase-14-12: dado de baja por el tutor (una completada quitada o un NO_HIZO revertido). */
  eliminado: boolean;
  /** fase-14-12: nota corta del tutor al marcar en rojo; la ve el integrante. */
  motivoTutor: string | null;
  createdAt: string;
}

export interface RegistroConductaDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  usuarioId: string;
  conductaId: string;
  sesionId: string;
  seccionId: string;
  valorPuntosSnapshot: number;
  registradoPorId: string;
  registradoPorTipo: PrincipalType;
  eliminado: boolean;
  createdAt: string;
}

/**
 * Estado de una actividad ACTIVA para el Usuario en la Sesión abierta actual
 * (fase-14-08, GET /activity/grupos/:grupoId/mi-estado-hoy). Reemplaza el `Set`
 * local optimista de la home y habilita la barrita "X de N" de repeticiones.
 */
export interface MiEstadoActividadHoyDto {
  actividadId: string;
  tipoPuntaje: TipoPuntaje;
  comportamientoAlCierre: ComportamientoAlCierre;
  repeticionesMaximasSesion: number;
  /** count RegistroActividad tipo=COMPLETADA del usuario+actividad+sesión actual. */
  vecesHechas: number;
  /** Obligatoria confirmable: vecesHechas > 0. Para OPCIONAL/ASUME_HECHA: false. */
  confirmada: boolean;
  /**
   * fase-14-12: repeticiones que el tutor quitó en esta Sesión — las "barritas
   * rojas perdidas". Son COMPLETADAS con `eliminado = true`: el intento se gastó.
   */
  vecesPerdidas: number;
  /**
   * fase-14-12: tope real de hoy (`repeticionesMaximasSesion − vecesPerdidas`).
   * Es contra ESTE número que el cliente deshabilita el botón, no contra el
   * máximo nominal — el servidor valida igual (regla 3 de CLAUDE.md).
   */
  topeEfectivo: number;
  /**
   * fase-14-12: hay un NO_HIZO vivo del tutor para esta actividad en la Sesión.
   * La actividad queda bloqueada hasta que el tutor deshaga la marca.
   */
  denegada: boolean;
  /** fase-14-12: nota del tutor de la marca roja más reciente; null si no dejó. */
  motivoTutor: string | null;
  /**
   * fase-14-14: instante absoluto (ISO) en que vence el deadline de HOY. null si
   * la actividad no es DEADLINE, o si no se pudo resolver la timezone del Grupo.
   * Lo calcula el servidor: `deadlineHora` es hora local del Grupo y el navegador
   * no conoce esa timezone (ADR-00 §6). El cliente solo resta contra "ahora".
   */
  deadlineEn: string | null;
  /**
   * fase-14-11: false si la actividad está programada y el día de la Sesión
   * actual no es uno de sus días. La calcula el servidor (es el que conoce la
   * timezone del Grupo) — el cliente no re-deriva el día.
   */
  disponibleHoy: boolean;
  /** Días configurados (0 = domingo … 6 = sábado); vacío = todos. */
  diasSemana: number[];
  /**
   * fase-14-17: la actividad está sujeta al plan del día — es OPCIONAL +
   * INDIVIDUAL + del catálogo del Tutor, no es `siempreVisible`, y el Grupo
   * tiene el modo activo. Con el modo apagado viaja `false` para todas.
   */
  requiereSeleccion: boolean;
  /**
   * fase-14-17: el integrante la eligió para hoy. Con `requiereSeleccion =
   * false` viaja SIEMPRE `true`, a propósito: así el cliente tiene una regla
   * única («se muestra si `enPlan`») en vez de combinar dos flags en cada punto
   * de la plantilla — donde el primer olvido escondería algo que debe verse.
   */
  enPlan: boolean;
  /**
   * fase-14-21: a quién le toca hoy esta obligatoria rotativa. `null` = la
   * actividad no rota (el caso de todas las que existían antes del ítem), y
   * entonces es de todos como siempre.
   */
  turno: TurnoDeHoyDto | null;
}

export interface MiEstadoHoyDto {
  /** null si no hay Sesión ABIERTA (actividades queda vacío). */
  sesionId: string | null;
  /** fase-14-17: el Grupo tiene el plan del día encendido. */
  planDelDiaActivo: boolean;
  actividades: MiEstadoActividadHoyDto[];
}

/**
 * Plan del día de un integrante (fase-14-17): las OPCIONALES que eligió hacer
 * en la Sesión abierta. Lo devuelven `POST`/`DELETE /plan-dia` ya actualizado,
 * para que la pantalla no tenga que re-consultar el estado entero.
 */
export interface PlanDelDiaDto {
  sesionId: string;
  actividadIds: string[];
}

export interface AgregarAlPlanDelDiaRequest {
  actividadId: string;
}

/** Una completada individual de un usuario, para que el tutor la pueda quitar. */
export interface RegistroCompletadaDto {
  registroId: string;
  createdAt: string;
}

/**
 * Actividades OPCIONALES que un usuario completó en la Sesión abierta (fase-14,
 * corrección del tutor). Agrupadas por actividad, con las filas individuales
 * para poder quitar una (la última) o todas. Solo completadas NO eliminadas.
 */
export interface CompletadaOpcionalDto {
  actividadId: string;
  nombre: string;
  valorPuntos: number;
  /** Ordenadas por createdAt asc; para "quitar una" se elimina la última. */
  registros: RegistroCompletadaDto[];
}

// --- Marcas rojas del tutor (fase-14-12) ---

/**
 * Clase de marca roja. `NO_HIZO` denegó una obligatoria entera;
 * `REPETICION_QUITADA` quemó una repetición de una opcional.
 */
export enum TipoMarcaRoja {
  NO_HIZO = 'NO_HIZO',
  REPETICION_QUITADA = 'REPETICION_QUITADA',
}

/**
 * Una marca roja viva de un usuario en la Sesión abierta (fase-14-12), para que
 * el tutor la pueda deshacer. Solo el tutor las lista: el integrante ve el
 * efecto agregado en `MiEstadoActividadHoyDto`, no las filas.
 */
export interface MarcaRojaDto {
  /** id del RegistroActividad — es lo que se manda a `/revertir`. */
  registroId: string;
  actividadId: string;
  nombre: string;
  tipo: TipoMarcaRoja;
  /** Impacto de la marca en el puntaje (negativo, o 0 si era una confirmación). */
  puntos: number;
  motivoTutor: string | null;
  /** Cuándo la aplicó el tutor (para REPETICION_QUITADA, cuándo la quitó). */
  marcadaEn: string;
}

// --- Tareas de equipo y reportes del jefe (fase-14-09) ---

export enum EstadoReporte {
  PENDIENTE = 'PENDIENTE',
  APROBADO = 'APROBADO',
  RECHAZADO = 'RECHAZADO',
}

/** Reparto resuelto de una tarea de equipo (una entrada por miembro). */
export interface AsignacionPuntosEquipoDto {
  usuarioId: string;
  /** valor base + bono del jefe si corresponde. */
  puntos: number;
  esJefe: boolean;
}

export interface CompletarTareaEquipoResponse {
  registroTareaEquipoId: string;
  equipoId: string;
  actividadId: string;
  asignaciones: AsignacionPuntosEquipoDto[];
}

/**
 * Una completada de tarea de equipo, viva o anulada (fase-14-13). Solo viaja
 * para el Tutor: es con lo que anula o deshace.
 */
export interface RegistroTareaEquipoDto {
  registroTareaEquipoId: string;
  /** true = el Tutor la anuló (el equipo perdió el reparto). */
  eliminado: boolean;
  motivoTutor: string | null;
  completadaEn: string;
}

/**
 * Estado de una tarea de equipo en la Sesión abierta (fase-14-13). Cierra
 * además la deuda del ítem 9: `mi-equipo` no sabía si la tarea ya se había
 * hecho hoy.
 */
export interface TareaEquipoDeHoyDto {
  actividadId: string;
  nombre: string;
  valorPuntos: number;
  bonoJefePuntos: number;
  repeticionesMaximasSesion: number;
  /** Completadas vivas del equipo en la Sesión (las barritas verdes). */
  vecesHechas: number;
  /** Completadas que el Tutor anuló: intentos quemados (barritas rojas). */
  vecesAnuladas: number;
  /** `repeticionesMaximasSesion − vecesAnuladas`. */
  topeEfectivo: number;
  /** Motivo de la anulación más reciente; null si el Tutor no dejó ninguno. */
  motivoTutor: string | null;
  /** fase-14-11: false si está programada y hoy no es uno de sus días. */
  disponibleHoy: boolean;
  diasSemana: number[];
  /** Filas con las que opera el Tutor; **vacío** cuando lo pide un USUARIO. */
  registros: RegistroTareaEquipoDto[];
}

/**
 * Reporte del jefe de equipo contra un integrante por una conducta MALA concreta
 * del catálogo (fase-14-09). El descuento se aplica solo si el Tutor lo aprueba.
 */
export interface ReporteMiembroDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  equipoId: string;
  reportadoUsuarioId: string;
  jefeUsuarioId: string;
  conductaId: string;
  motivo: string | null;
  estado: EstadoReporte;
  resueltoPorTutorId: string | null;
  registroConductaId: string | null;
  createdAt: string;
}

export interface CrearReporteMiembroRequest {
  reportadoUsuarioId: string;
  /** conducta MALA ACTIVA del grupo. */
  conductaId: string;
  motivo?: string;
}

// --- Contenido creado por los integrantes (fase-14-10) ---

/**
 * Quién puede crear contenido en el catálogo del Grupo (fase-14-10, decisión 1).
 * Configurable por Grupo; el default RESTRICTIVO es el comportamiento previo.
 */
export enum ModoCreacionContenidoUsuario {
  /** Solo Tutor/ORG_ADMIN crea (comportamiento previo a fase-14-10). */
  RESTRICTIVO = 'RESTRICTIVO',
  /** El integrante propone; el Tutor aprueba o rechaza antes de que exista. */
  BAJO_APROBACION = 'BAJO_APROBACION',
  /** El integrante crea y su actividad queda ACTIVA al instante. */
  LIBRE = 'LIBRE',
}

export enum EstadoPropuesta {
  PENDIENTE = 'PENDIENTE',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
}

export interface ConfiguracionContenidoGrupoDto {
  grupoId: string;
  modoCreacionUsuario: ModoCreacionContenidoUsuario;
  /** Tope de puntos de una actividad creada por un integrante. */
  maxPuntosActividadUsuario: number;
  /** Tope de actividades propias vivas a la vez (ACTIVA + propuestas PENDIENTE). */
  maxActividadesActivasPorUsuario: number;
  /**
   * fase-14-17: con true, las OPCIONALES individuales del catálogo del Tutor se
   * ocultan de la lista hasta que el integrante las mete en su plan del día.
   */
  planDelDiaActivo: boolean;
}

export interface ActualizarConfiguracionContenidoRequest {
  modoCreacionUsuario?: ModoCreacionContenidoUsuario;
  maxPuntosActividadUsuario?: number;
  maxActividadesActivasPorUsuario?: number;
  planDelDiaActivo?: boolean;
}

/**
 * Propuesta de actividad de un integrante (fase-14-10). Objeto de workflow: en
 * modo LIBRE nace ya APROBADA (`resueltoPorTipo = 'SYSTEM'`) y con `actividadId`;
 * en BAJO_APROBACION nace PENDIENTE y no hay Actividad hasta que el Tutor aprueba.
 */
export interface PropuestaActividadDto {
  id: string;
  organizacionId: string;
  grupoId: string;
  creadaPorUsuarioId: string;
  nombre: string;
  descripcion: string | null;
  valorPuntos: number;
  repeticionesMaximasSesion: number;
  estado: EstadoPropuesta;
  modoAlCrear: ModoCreacionContenidoUsuario;
  resueltoPorId: string | null;
  /** 'TUTOR' | 'SYSTEM' (SYSTEM = auto-aprobada por modo LIBRE). */
  resueltoPorTipo: string | null;
  motivoRechazo: string | null;
  actividadId: string | null;
  createdAt: string;
}

export interface CrearMiActividadRequest {
  nombre: string;
  descripcion?: string | null;
  valorPuntos: number;
  repeticionesMaximasSesion?: number;
}

export interface CrearMiActividadResponse {
  propuesta: PropuestaActividadDto;
  /** La Actividad ya creada (modo LIBRE); null si quedó pendiente de aprobación. */
  actividad: ActividadDto | null;
}

export interface RechazarPropuestaRequest {
  motivo?: string;
}

/**
 * Todo lo que la pantalla "Mis actividades" del integrante necesita, en una
 * sola llamada: la config vigente del grupo, si puede crear, sus actividades
 * personales activas y sus propuestas con estado.
 */
export interface MisActividadesDto {
  modoCreacionUsuario: ModoCreacionContenidoUsuario;
  maxPuntosActividadUsuario: number;
  maxActividadesActivasPorUsuario: number;
  /** false si el modo es RESTRICTIVO o si ya llegó al cupo. */
  puedeCrear: boolean;
  /** Cupo ya usado: actividades propias ACTIVA + propuestas PENDIENTE. */
  cupoUsado: number;
  actividades: ActividadDto[];
  propuestas: PropuestaActividadDto[];
}

// --- Historial de la sesión (fase-14-18) ---

/** Clase de fila del timeline. Decide qué acciones aplican y cómo se pinta. */
export enum TipoEventoHistorial {
  ACTIVIDAD_COMPLETADA = 'ACTIVIDAD_COMPLETADA',
  ACTIVIDAD_NO_HIZO = 'ACTIVIDAD_NO_HIZO',
  CONDUCTA = 'CONDUCTA',
  TAREA_EQUIPO = 'TAREA_EQUIPO',
}

/** Sobre qué clase de registro cuelga una nota interna (espejo del enum Prisma). */
export enum TipoRegistroHistorial {
  ACTIVIDAD = 'ACTIVIDAD',
  CONDUCTA = 'CONDUCTA',
  TAREA_EQUIPO = 'TAREA_EQUIPO',
}

/**
 * Nota interna del Tutor sobre un registro (fase-14-18). **Nunca** viaja a la
 * app del integrante — es lo contrario del `motivoTutor`, que sí se le muestra.
 */
export interface NotaRegistroDto {
  id: string;
  texto: string;
  autorTutorId: string;
  autorNombre: string;
  createdAt: string;
  /** true si la escribió quien está mirando: habilita el botón de borrar. */
  esPropia: boolean;
}

/**
 * Una fila del historial de la sesión (fase-14-18). No sale de una tabla propia:
 * se arma leyendo RegistroActividad / RegistroConducta / RegistroTareaEquipo
 * (spec, decisión 10). `id` es el de la fila de origen, y es lo que consumen
 * anular / deshacer / notas.
 */
export interface EventoHistorialDto {
  id: string;
  tipo: TipoEventoHistorial;
  /** Instante absoluto ISO; se formatea en `timezoneGrupo`, no en la del navegador. */
  ocurridoEn: string;
  /** null en TAREA_EQUIPO: ahí el sujeto es el equipo. */
  usuarioId: string | null;
  usuarioNombre: string | null;
  equipoId: string | null;
  equipoNombre: string | null;
  /** actividadId o conductaId según el tipo. */
  itemId: string;
  itemNombre: string;
  /**
   * Snapshot con signo tal como quedó guardado. 0 en las confirmaciones de
   * obligatorias. En TAREA_EQUIPO es lo que recibió CADA miembro.
   */
  puntos: number;
  /** Solo TAREA_EQUIPO. */
  bonoJefe: number | null;
  /** Solo TAREA_EQUIPO. */
  cantidadMiembros: number | null;
  registradoPorId: string;
  registradoPorTipo: 'TUTOR' | 'USUARIO' | 'SYSTEM';
  /** Nombre resuelto, o un fallback legible — nunca un uuid crudo. */
  registradoPorNombre: string;
  anulado: boolean;
  anuladoPorNombre: string | null;
  anuladoEn: string | null;
  /** Motivo VISIBLE para el integrante (fase-14-12). Distinto de las notas. */
  motivoTutor: string | null;
  revertidoEn: string | null;
  revertidoPorNombre: string | null;
  notas: NotaRegistroDto[];
}

/** Respuesta de `GET /activity/grupos/:grupoId/historial`. */
export interface HistorialSesionDto {
  /** null si el grupo no tiene Sección vigente. */
  sesionId: string | null;
  /** ABIERTA habilita las acciones; CERRADA es solo lectura (spec, decisión 14). */
  sesionEstado: EstadoSesion | null;
  /** IANA, del Grupo: con esto el frontend formatea las horas (decisión 15). */
  timezoneGrupo: string;
  eventos: EventoHistorialDto[];
  /** null cuando no hay más páginas. */
  cursorSiguiente: string | null;
}

// --- Turnos rotativos (fase-14-21) ---
//
// El patrón es una SECUENCIA LITERAL, no un reparto parejo: `[José, Luciana,
// José, Alejandra]` son 4 posiciones y 3 personas, y José recibe 2 de cada 4
// turnos. La repetición vive en los datos, no en el algoritmo.

export enum ModoTurno {
  /** Se recorre la lista tal como la escribió el Tutor. */
  ORDEN_FIJO = 'ORDEN_FIJO',
  /** Se barajan las POSICIONES al empezar cada vuelta, no las personas. */
  AZAR = 'AZAR',
}

export enum FrecuenciaTurno {
  SESION = 'SESION',
  SECCION = 'SECCION',
}

/** Por qué una posición no puede recibir el turno (se saltea al sellar). */
export enum AvisoPosicionTurno {
  YA_NO_ESTA_EN_EL_GRUPO = 'YA_NO_ESTA_EN_EL_GRUPO',
  SIN_EL_ROL = 'SIN_EL_ROL',
}

export interface PosicionTurnoDto {
  orden: number;
  usuarioId: string;
  nombre: string;
  /** null = la posición está en condiciones de recibir el turno. */
  aviso: AvisoPosicionTurno | null;
}

/** Lo que ve el participante en su lista (fase-14-21, decisión 5). */
export interface TurnoDeHoyDto {
  /** null = hoy no le toca a nadie (todas las posiciones quedaron inválidas). */
  usuarioIdAsignado: string | null;
  nombreAsignado: string | null;
  /** false ⇒ la tarjeta se muestra SIN botón, con «hoy le toca a Ana». */
  esMio: boolean;
}

export interface AsignacionTurnoDto {
  actividadId: string;
  usuarioId: string;
  nombre: string;
  vueltaNumero: number;
  indice: number;
  /** No null si el Tutor lo reasignó a mano (decisión 8). */
  usuarioOriginalId: string | null;
  nombreOriginal: string | null;
  reasignadoEn: string | null;
  motivoReasignacion: string | null;
}

export interface TurnoActividadDto {
  actividadId: string;
  modo: ModoTurno;
  frecuencia: FrecuenciaTurno;
  activo: boolean;
  /** La secuencia tal como la definió el Tutor, en orden. */
  posiciones: PosicionTurnoDto[];
  /** Turno vigente del ámbito actual; null si todavía no se selló ninguno. */
  asignacionVigente: AsignacionTurnoDto | null;
  /**
   * Los próximos turnos previstos de la vuelta en curso. Es una PREVISIÓN: la
   * vuelta ya está sellada, pero un integrante que se va antes de su día hace
   * que se saltee esa posición (decisión 14).
   */
  proximos: Array<{ usuarioId: string; nombre: string }>;
}

export interface ConfigurarTurnoRequest {
  modo: ModoTurno;
  frecuencia: FrecuenciaTurno;
  activo?: boolean;
  /** El ORDEN del array ES la secuencia. Se admiten repetidos a propósito. */
  posiciones: Array<{ usuarioId: string }>;
}

export type ConfigurarTurnoResponse = TurnoActividadDto;

export interface ReasignarTurnoRequest {
  usuarioId: string;
  motivo?: string;
}

/** Fila de `GET /activity/grupos/:grupoId/turnos-de-hoy` (panel del Tutor). */
export interface TurnoDeHoyDelGrupoDto {
  actividadId: string;
  actividadNombre: string;
  frecuencia: FrecuenciaTurno;
  asignacion: AsignacionTurnoDto | null;
}
