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
  /**
   * fase-14-25: cuántas confirmaciones hacen falta para NO perder puntos al
   * cerrar la Sesión. 1 fuera de OBLIGATORIA + REQUIERE_CONFIRMACION, y 1 en
   * toda actividad anterior al ítem — con 1, el castigo es el binario del #8.
   */
  repeticionesMinimasSesion: number;
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
  /**
   * fase-14-33: instante real de la carga cuando la fila se escribió en una
   * Sesión que **no** era la abierta. `null` significa «se cargó en su día» —
   * que es el caso de todo lo anterior a ese ítem y de todo lo del día.
   */
  cargadoRetroactivamenteEn: string | null;
  /** fase-14-33: por qué se cargó fuera de su día. Obligatorio si el anterior no es null. */
  motivoRetroactivo: string | null;
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
  /** fase-14-33: ver `RegistroActividadDto.cargadoRetroactivamenteEn`. */
  cargadoRetroactivamenteEn: string | null;
  motivoRetroactivo: string | null;
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
  /** fase-14-25: el mínimo nominal configurado por el Tutor (1 = como siempre). */
  repeticionesMinimasSesion: number;
  /**
   * fase-14-25: el mínimo que de verdad se le va a exigir hoy —
   * `min(repeticionesMinimasSesion, topeEfectivo)`—, ya resuelto por el
   * servidor. Es contra ESTE que la pantalla dibuja el umbral de la barrita,
   * por el mismo motivo por el que existe `topeEfectivo`: que el cliente no
   * re-derive una regla que decide el servidor.
   */
  minimoEfectivo: number;
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

// --- Estado operativo del día por REST interno (fase-14-31) ---

/**
 * Lo que hace falta para **anotar y para desanotar** sin marcar a ciegas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE DTO EXISTE Y NO ALCANZABA `MiEstadoHoyDto`:
 *
 * Por la decisión 1 del #30, *ninguna herramienta de propuesta puede aceptar un
 * id que ninguna herramienta de lectura devuelva*. `proponer_quitar_marcas`
 * necesita `registroId`, y hasta acá **ninguna lectura devolvía uno**: el
 * modelo solo podría inventarlo. Esa es la mitad del contenido de este DTO.
 *
 * La otra mitad son los tres booleanos: sin ellos la IA propone marcar lo que
 * ya está marcado, o una actividad que hoy no le toca a esa persona, y la
 * propuesta muere al aplicar. **Las reglas se calculan donde vive el endpoint
 * que las hace cumplir**, no en quien arma el request.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface EstadoDeHoyInternoDto {
  /**
   * `false` = no se puede anotar nada.
   *
   * fase-14-33: dejó de significar «hay Sesión ABIERTA» para significar «la
   * Sección vigente admite escritura», que es lo que el modelo necesita saber.
   * El nombre se mantiene porque cambiarlo rompería la propuesta armada por una
   * versión anterior en vuelo, y lo que responde es lo mismo: ¿tiene sentido
   * que arme algo?
   */
  sesionAbierta: boolean;
  /** fase-14-33: a qué Sesión corresponde lo leído. `undefined` si no hay. */
  sesionId?: string;
  sesionNumero?: number;
  /** fase-14-33: `false` = es una Sesión ya cerrada de la Sección vigente. */
  esSesionAbierta?: boolean;
  participantes: ParticipanteDeHoyInternoDto[];
}

export interface ParticipanteDeHoyInternoDto {
  usuarioId: string;
  nombre: string;
  actividades: ActividadDeHoyInternaDto[];
  /** Todo lo que hoy se le puede quitar o revertir, con el id que lo hace. */
  marcas: MarcaDeHoyInternaDto[];
}

export interface ActividadDeHoyInternaDto {
  actividadId: string;
  nombre: string;
  tipoPuntaje: TipoPuntaje;
  valorPuntos: number;
  vecesHechas: number;
  /** Cuántas veces más admite hoy. 0 = ya no se puede marcar como hecha. */
  vecesQueAdmite: number;
  puedeMarcarHizo: boolean;
  puedeMarcarNoHizo: boolean;
  /** Por qué hoy no se le puede marcar. `null` = se puede. */
  motivoNoDisponible: string | null;
}

export type TipoMarcaDeHoy = 'COMPLETADA' | 'NO_HIZO' | 'REPETICION_QUITADA' | 'CONDUCTA';

export interface MarcaDeHoyInternaDto {
  /** El id que se manda al endpoint que la quita o la revierte. */
  registroId: string;
  tipo: TipoMarcaDeHoy;
  /** Legible: «Tender la cama», «Gritar». Es lo que va a leer el Tutor. */
  descripcion: string;
  /** Lo que esta marca le suma o le resta hoy al puntaje. */
  puntos: number;
}

export interface MiEstadoHoyDto {
  /** null si no hay Sesión ABIERTA (actividades queda vacío). */
  sesionId: string | null;
  /** fase-14-17: el Grupo tiene el plan del día encendido. */
  planDelDiaActivo: boolean;
  /**
   * fase-14-33: qué Sesión se está mirando. Para el integrante es siempre la
   * abierta; para el Tutor puede ser una pasada de la Sección vigente, y la
   * pantalla necesita saberlo sin cruzarlo con otra llamada. `null` cuando
   * `sesionId` es null.
   */
  sesionEstado: 'ABIERTA' | 'CERRADA' | null;
  sesionNumero: number | null;
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

/**
 * Los tres requests con que se anota lo del día (fase-07 Parte A).
 *
 * Existían como clases con decoradores en activity-service y **no tenían
 * interfaz acá** hasta el fase-14-31 tanda 6, por el mismo motivo que
 * `AjustarMonedasRequest` (tanda 5): hasta entonces el único que los armaba era
 * el frontend del Tutor, que los escribe inline. Ahora también los arma una
 * propuesta del asistente (`proponer_anotar`), y la decisión 11 del #29 pide
 * que todo esquema Zod de propuesta se tipe contra el contrato real — si no,
 * renombrar `usuarioId` acá se descubriría recién al aplicar.
 *
 * `usuarioId` es opcional en dos de los tres y obligatorio en el del medio, y
 * no es una inconsistencia: `completar` y `registrar` los puede llamar el
 * propio integrante (ahí se fuerza a sí mismo y el campo se ignora), y un «no
 * hizo» **siempre lo registra un Tutor sobre otro** — nadie se autodenuncia.
 */
export interface CompletarActividadRequest {
  /** Solo aplica cuando registra un TUTOR/ORG_ADMIN; un USUARIO se marca a sí mismo. */
  usuarioId?: string;
  /** fase-14-33. Ver `EscrituraEnSesionRequest`. */
  sesionId?: string;
  motivoRetroactivo?: string;
}

export interface RegistrarNoHizoRequest {
  usuarioId: string;
  /** Nota que el integrante lee en su pantalla (fase-14-12). Máximo 200. */
  motivo?: string;
  /** fase-14-33. Ver `EscrituraEnSesionRequest`. */
  sesionId?: string;
  motivoRetroactivo?: string;
}

export interface RegistrarConductaRequest {
  /** Obligatorio si lo registra un TUTOR/ORG_ADMIN; ignorado si es autoreporte. */
  usuarioId?: string;
  /** fase-14-33. Ver `EscrituraEnSesionRequest`. */
  sesionId?: string;
  motivoRetroactivo?: string;
}

/**
 * Los dos campos que fase-14-33 le agrega a **toda** escritura del Tutor.
 *
 * No es una interfaz de la que hereden los requests —los tres de arriba los
 * declaran a mano— sino la documentación de un par que aparece repetido a
 * propósito: `extends` acá haría que agregar un campo a este par se lo agregue
 * en silencio a endpoints que quizás no lo aceptan, y este proyecto prefiere
 * que ampliar un contrato sea una decisión visible endpoint por endpoint.
 *
 * - `sesionId`: en qué Sesión de la **Sección vigente** cae la escritura. Sin
 *   él, la Sesión abierta — el comportamiento de siempre, byte por byte. Lo
 *   manda un `TUTOR`/`ORG_ADMIN`; a un `USUARIO` se le **ignora** (decisión 11),
 *   igual que `usuarioId`.
 * - `motivoRetroactivo`: **obligatorio** cuando `sesionId` apunta a una Sesión
 *   que no es la abierta (400 `MOTIVO_RETROACTIVO_REQUERIDO` si falta). Máximo
 *   200, igual que `motivoTutor`. A diferencia de aquel, no describe la marca:
 *   describe por qué la fila aparece en un día que ya había terminado.
 */
export interface EscrituraEnSesionRequest {
  sesionId?: string;
  motivoRetroactivo?: string;
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
  /** fase-14-33: la marca se cargó a una Sesión que ya había cerrado. */
  cargadoRetroactivamenteEn: string | null;
  motivoRetroactivo: string | null;
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
  /** fase-14-33: la tarea se cargó a una Sesión que ya había cerrado. */
  cargadoRetroactivamenteEn: string | null;
  motivoRetroactivo: string | null;
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
  /**
   * fase-14-33: la fila se cargó a una Sesión que ya había cerrado. La UI lo
   * muestra con el chip «Cargado después»; `null` es todo lo que se registró
   * en su propio día.
   */
  cargadoRetroactivamenteEn: string | null;
  motivoRetroactivo: string | null;
  notas: NotaRegistroDto[];
}

/** Respuesta de `GET /activity/grupos/:grupoId/historial`. */
export interface HistorialSesionDto {
  /** null si el grupo no tiene Sección vigente. */
  sesionId: string | null;
  /**
   * fase-14-18: `ABIERTA` habilitaba las acciones y `CERRADA` era solo lectura.
   * fase-14-33: **el estado ya no decide eso** — cualquier Sesión de la Sección
   * vigente se puede editar, y quien decide es `seccionEditable`. El campo se
   * mantiene porque la pantalla sí lo usa para decir qué está mirando.
   */
  sesionEstado: EstadoSesion | null;
  /** fase-14-33: número de la Sesión dentro de la Sección (1..n). */
  sesionNumero: number | null;
  /**
   * fase-14-33: la Sección vigente admite escritura (no está `CERRADA`). Es lo
   * que habilita o apaga los botones del historial, para que el frontend no
   * tenga que reimplementar la regla 6 mirando dos estados.
   */
  seccionEditable: boolean;
  /** IANA, del Grupo: con esto el frontend formatea las horas (decisión 15). */
  timezoneGrupo: string;
  eventos: EventoHistorialDto[];
  /** null cuando no hay más páginas. */
  cursorSiguiente: string | null;
}

/**
 * fase-14-33: una Sesión de la Sección vigente, para el selector del panel
 * operativo y para que el asistente pueda resolver «el lunes» a un uuid sin
 * adivinarlo (`listar_sesiones_de_la_seccion`).
 *
 * Es un subconjunto de `SesionDto` a propósito: lo que necesita quien elige
 * dónde escribir, no la fila entera de session-service.
 */
export interface SesionDeLaSeccionDto {
  id: string;
  numero: number;
  estado: EstadoSesion;
  fechaInicio: string;
  fechaFin: string | null;
  /** true = es la Sesión donde caen las escrituras sin `sesionId`. */
  esLaAbierta: boolean;
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
  /**
   * `${Enum}` desde el fase-14-30 tanda 2, por el mismo motivo que en
   * `CrearActividadRequest` (ver la nota larga ahí): la clase con decoradores de
   * activity-service valida contra los enums que genera Prisma, y con el enum de
   * esta librería el `implements` no compilaba. Es una ampliación del tipo, no
   * un cambio de contrato: los miembros de los dos enums siguen siendo válidos.
   */
  modo: `${ModoTurno}`;
  frecuencia: `${FrecuenciaTurno}`;
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

/**
 * Una fila del catálogo que PUEDE rendir monedas (fase-14-28 D.3): lo que
 * devuelve el interno `GET /internal/activity/grupos/:grupoId/catalogo-rendible`
 * y lo que alimenta la pantalla de rendimientos por acción de rewards.
 *
 * Vive en activity y no en rewards porque el dato es de activity — rewards solo
 * lo referencia por ID (regla 2). Trae los campos que la pantalla necesita para
 * avisar sin una segunda llamada: si una obligatoria `ASUME_HECHA` nunca puede
 * pagar (decisión 15) y si corresponde el bono del jefe (decisión 8).
 */
export interface AccionRendibleDto {
  id: string;
  nombre: string;
  valorPuntos: number;
  /** null en una conducta: el tipo de puntaje es propio de las actividades. */
  tipoPuntaje: TipoPuntaje | null;
  alcance: AlcanceActividad | null;
  comportamientoAlCierre: ComportamientoAlCierre | null;
  /** Para poder mostrar el bono en monedas al lado del bono en puntos. */
  bonoJefePuntos: number | null;
  /**
   * Cada repetición paga (decisión 16), así que el techo de una actividad es
   * `monedas × repeticiones`. Es lo que hace calculable el aviso de calibración
   * de la Parte F. `null` en una conducta: no tiene tope por sesión.
   */
  repeticionesMaximasSesion: number | null;
}

/** Catálogo rendible del Grupo, partido por lo que discrimina el rendimiento. */
export interface CatalogoRendibleDto {
  actividades: AccionRendibleDto[];
  /** Solo conductas BUENA: una MALA no tiene nada que configurar (decisión 17). */
  conductas: AccionRendibleDto[];
}

/**
 * Una fila del resumen de cumplimiento (fase-14-29 tanda 3, herramienta
 * `resumen_cumplimiento`). Responde «¿qué actividad nadie hace nunca?», que es
 * la pregunta que el Tutor no puede contestar mirando el catálogo: ahí todas
 * las actividades se ven igual de vivas.
 *
 * Los contadores se derivan del ledger de registro (`RegistroActividad`),
 * excluyendo lo eliminado y no revertido — una marca que el Tutor quitó no
 * cuenta como cumplida, igual que no cuenta para el puntaje.
 */
export interface CumplimientoActividadDto {
  actividadId: string;
  nombre: string;
  /** Mismo par que el resto de los DTOs del catálogo — no hay un tipo con nombre. */
  estado: 'ACTIVA' | 'ARCHIVADA';
  tipoPuntaje: TipoPuntaje;
  valorPuntos: number;
  /** Marcas COMPLETADA vigentes en la ventana. */
  vecesCompletada: number;
  /** Marcas NO_HIZO vigentes en la ventana (incluye el castigo del cierre). */
  vecesNoHizo: number;
  /** Cuántas personas distintas la completaron al menos una vez. */
  participantesDistintos: number;
  /** ISO-8601 de la última marca COMPLETADA, o null si nunca. */
  ultimaVezCompletada: string | null;
}

/** Resumen de cumplimiento del Grupo sobre una ventana de días. */
export interface ResumenCumplimientoDto {
  grupoId: string;
  /** Ventana observada, en días hacia atrás desde ahora. */
  dias: number;
  /** Una fila por actividad del catálogo, incluidas las que tienen 0 marcas. */
  actividades: CumplimientoActividadDto[];
}

// --- Contratos de request del catálogo (fase-14-29 tanda 5) ---
//
// Estas interfaces son la MISMA forma que los bodies de los endpoints de
// activity-service: sus clases con decoradores las `implements`, así que
// cambiarles un campo rompe el build de quien las use.
//
// Existen porque `ai-service` arma propuestas con la forma EXACTA del request
// destino: aplicar una propuesta es un `for` sobre el array, no una traducción.
// Sin este contrato compartido, un campo renombrado en activity se descubriría
// en producción, cuando el Tutor aprieta «Aplicar» y la API rechaza la fila.

export interface CrearActividadRequest {
  nombre: string;
  descripcion?: string | null;
  /**
   * `${Enum}` y no `Enum` a propósito, en los cuatro campos de enumeración.
   *
   * La clase con decoradores de activity-service valida contra los enums que
   * GENERA PRISMA, no contra los de esta librería. TypeScript trata dos `enum`
   * declarados por separado como tipos distintos aunque tengan exactamente los
   * mismos valores, así que un `implements` contra el enum de acá no compila.
   *
   * El tipo plantilla resuelve la union de los strings del enum
   * (`'OPCIONAL' | 'OBLIGATORIA'`), a la que **sí** son asignables los miembros
   * de los dos enums — y sigue derivándose del enum, así que agregar un valor
   * lo propaga solo.
   */
  tipoPuntaje: `${TipoPuntaje}`;
  /** Siempre positivo: el signo se aplica al registrar. */
  valorPuntos: number;
  puntosPorCumplir?: number;
  tipoLimiteTiempo: `${TipoLimiteTiempo}`;
  deadlineHora?: string | null;
  duracionCronometroMinutos?: number | null;
  repeticionesMaximasSesion?: number;
  repeticionesMinimasSesion?: number;
  repeticionesMaximasSeccion?: number | null;
  comportamientoAlCierre?: `${ComportamientoAlCierre}`;
  alcance?: `${AlcanceActividad}`;
  bonoJefePuntos?: number;
  /** 0=domingo … 6=sábado. Vacío u omitido = todos los días. */
  diasSemana?: number[];
  siempreVisible?: boolean;
  rolesPermitidos?: string[];
  usuariosPermitidos?: string[];
  equiposPermitidos?: string[];
  /** Fecha civil `YYYY-MM-DD` del calendario del Grupo. */
  vigenteDesde?: string | null;
  vigenteHasta?: string | null;
}

/** Todo opcional: es un PATCH. */
export type EditarActividadRequest = Partial<CrearActividadRequest>;

// --- Contratos de request de conductas (fase-14-30 tanda 2) ---
//
// Mismo criterio y misma nota sobre `${Enum}` que los de actividad: la clase
// con decoradores de activity-service los `implements`, así que renombrarle un
// campo rompe el build de quien arme un request con esta forma.

export interface CrearConductaRequest {
  nombre: string;
  tipo: `${TipoConducta}`;
  /** Siempre positivo: el signo lo aplica el registro según `tipo`. */
  valorPuntos: number;
  /** Solo relevante con `tipo = MALA`; en BUENA el servicio lo fuerza a false. */
  permiteAutoreporte?: boolean;
}

/**
 * PATCH: todo opcional. **Sin `estado`** — archivar es otro camino (`DELETE`),
 * y el fase-14-30 (decisión 3) no propone archivados por ninguna vía.
 */
export type EditarConductaRequest = Partial<CrearConductaRequest>;

// --- Lecturas internas del asistente (fase-14-30 tanda 3) ---
//
// Sin campos de tenant, como `TiendaInternaDto`: quien las consume ya sabe de
// qué grupo preguntó, y lo que vuelve viaja hacia un proveedor externo.

/**
 * La configuración del Grupo que cambia qué significan otros campos. Es el
 * contexto sin el cual varias propuestas se arman a ciegas: `siempreVisible`
 * solo hace algo con `planDelDiaActivo` prendido, y proponer contenido de
 * integrantes no tiene sentido en modo RESTRICTIVO.
 *
 * Devuelve los DEFAULTS cuando el grupo no tiene fila, igual que el endpoint
 * público: "sin configurar" es una configuración, no un dato que falta.
 */
export interface ConfiguracionActividadInternaDto {
  planDelDiaActivo: boolean;
  modoCreacionUsuario: `${ModoCreacionContenidoUsuario}`;
  maxPuntosActividadUsuario: number;
  maxActividadesActivasPorUsuario: number;
}

/**
 * La rotación de una actividad, sin los nombres ni la previsión de la vuelta en
 * curso que sí lleva `TurnoActividadDto`: resolverlos cuesta una llamada a
 * identity y quien consume esto ya tiene su propia lectura de participantes.
 */
export interface TurnoActividadInternoDto {
  actividadId: string;
  modo: `${ModoTurno}`;
  frecuencia: `${FrecuenciaTurno}`;
  activo: boolean;
  /** El ORDEN del array ES la secuencia. Se admiten repetidos a propósito. */
  posiciones: Array<{ orden: number; usuarioId: string }>;
}
