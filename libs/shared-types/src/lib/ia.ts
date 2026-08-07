// DTOs del asistente de IA (fase-14-29). Servicio: ai-service, prefijo /api/ai.

/**
 * Estado del asistente para la organización del solicitante.
 * `GET /api/ai/configuracion`.
 *
 * Los dos primeros campos responden preguntas distintas y la pantalla los
 * muestra distinto: `disponibleEnPlan` se resuelve cambiando de plan,
 * `habilitada` con un clic del ORG_ADMIN.
 */
export interface ConfiguracionIaDto {
  /** El plan de la organización incluye el asistente (billing). */
  disponibleEnPlan: boolean;
  /** El ORG_ADMIN lo prendió (fase-14-29 decisión 5). */
  habilitada: boolean;
  /**
   * Si el aviso **vigente** está aceptado.
   *
   * Cambió de significado en el fase-14-31 (decisión 11): antes era «alguna vez
   * se aceptó», ahora es «se aceptó la versión que rige hoy». Quien aceptó una
   * lista de datos más corta no aceptó ésta, así que ese `true` de ayer sería
   * un consentimiento que nadie dio.
   */
  avisoAceptado: boolean;
  /** ISO-8601 de la última aceptación, null si nunca se aceptó. */
  aceptoAvisoEn: string | null;
  /**
   * Qué versión del aviso se aceptó. `null` = nunca. Las aceptaciones del
   * fase-14-29 valen como **1** aunque su columna esté en NULL: son anteriores
   * al campo, no aceptaciones vacías.
   */
  avisoVersionAceptada: number | null;
  /** La versión que rige hoy. Si es mayor que la aceptada, hay que volver a aceptar. */
  avisoVersionVigente: number;
  /** Techo mensual de tokens de la organización. null = sin límite. */
  cuotaTokensMensuales: number | null;
  /**
   * Tokens (entrada + salida) consumidos en el mes calendario en curso.
   * Derivado sumando el ledger de mensajes, no un contador (decisión 8).
   */
  tokensConsumidosMes: number;
  /**
   * Si el asistente puede usarse AHORA: exige plan, switch prendido, **aviso
   * vigente aceptado** (fase-14-31 decisión 11) y cuota disponible. Es el único
   * campo que la pantalla necesita mirar para decidir si habilita el chat — los
   * otros son para explicar por qué no.
   */
  puedeUsarse: boolean;
}

/**
 * La versión del aviso de datos que rige hoy (fase-14-31 decisión 11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ES UNA CONSTANTE COMPARTIDA Y NO UN NÚMERO EN CADA LADO:
 *
 * el backend decide si el asistente se puede usar y el frontend decide qué
 * texto mostrar, y las dos decisiones tienen que hablar de la **misma** versión
 * o el resultado es una pantalla que dice «ya lo aceptaste» sobre un asistente
 * que responde 403. Subir esto de número es lo único que hace falta para volver
 * a pedir el consentimiento, y por eso el texto del aviso y este número se
 * tocan juntos: **si cambia lo que sale hacia el proveedor, sube la versión.**
 *
 * Historia: **1** = el aviso del fase-14-29 (nombres, catálogo, puntajes).
 * **2** = suma el saldo en monedas y el estado de cumplimiento del día por
 * persona, que son las dos clases de dato que agregaron las lecturas nuevas del
 * fase-14-31.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const AVISO_IA_VERSION_VIGENTE = 2;

/** `PUT /api/ai/configuracion` — solo ORG_ADMIN. */
export interface CambiarConfiguracionIaRequest {
  habilitada: boolean;
  /**
   * Obligatorio en `true` para habilitar por primera vez **y cada vez que el
   * aviso cambia de versión** (decisión 5 del #29, decisión 11 del #31).
   * Se ignora al deshabilitar: un consentimiento dado no se retira apagando
   * el switch, queda registrado como el hecho que fue.
   */
  aceptaAviso?: boolean;
}

export type CambiarConfiguracionIaResponse = ConfiguracionIaDto;

// --- Conversaciones (fase-14-29 tanda 4) ---

export type RolMensajeIa = 'USUARIO' | 'ASISTENTE' | 'HERRAMIENTA' | 'SISTEMA';

/**
 * Un mensaje del ledger. `contenido` de un mensaje HERRAMIENTA es un resumen
 * («ok (1234 bytes)»), no los datos: el ledger existe para auditar qué se
 * consultó, no para volver a servir el catálogo.
 */
export interface MensajeIaDto {
  id: string;
  rol: RolMensajeIa;
  contenido: string;
  /** `nombre(args)` cuando el rol es HERRAMIENTA; null en el resto. */
  herramienta: string | null;
  createdAt: string;
}

export interface ConversacionIaDto {
  id: string;
  grupoId: string;
  titulo: string;
  archivada: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConversacionIaDetalleDto extends ConversacionIaDto {
  mensajes: MensajeIaDto[];
  /** Las propuestas armadas en esta conversación (fase-14-29 tanda 5). */
  propuestas: PropuestaIaDto[];
}

/** `POST /api/ai/conversaciones`. */
export interface CrearConversacionIaRequest {
  grupoId: string;
  primerMensaje: string;
}

export type CrearConversacionIaResponse = ConversacionIaDetalleDto;

/** `POST /api/ai/conversaciones/:id/mensajes`. */
export interface EnviarMensajeIaRequest {
  texto: string;
}

// --- Eventos SSE (fase-14-29 tanda 6) ---

/**
 * Lo que viaja por `text/event-stream` mientras el loop trabaja.
 *
 * **Los dos endpoints que corren el loop lo negocian por `Accept`**: con
 * `text/event-stream` transmiten estos eventos, sin él contestan el JSON de
 * siempre. Un turno tarda entre 20 y 50 segundos y la mayor parte de ese
 * tiempo se va en llamadas a herramientas, así que lo que hace usable la
 * pantalla es saber *qué está haciendo*, no ver el texto letra por letra.
 *
 * **El texto llega entero en un solo evento y es una decisión, no una etapa
 * intermedia** (José, 2026-08-04): streamear los deltas del proveedor obliga a
 * parsear su propio SSE y a sacar el `usage` del evento final, o sea a tocar
 * el único camino del monorepo que gasta dinero — y no cambia ni la respuesta
 * ni lo que cuesta, solo cómo aparece.
 */
export type EventoIaSse =
  /** Solo al crear: el id recién asignado, para que la pantalla ya pueda navegar. */
  | { tipo: 'conversacion'; conversacion: ConversacionIaDto }
  /** El mensaje del usuario tal como quedó en el ledger. */
  | { tipo: 'mensaje'; mensaje: MensajeIaDto }
  /** Una herramienta del loop cambió de estado. `nombre` es el de la definición. */
  | { tipo: 'herramienta'; nombre: string; estado: 'corriendo' | 'ok' | 'error' }
  /** La respuesta para el humano, completa. */
  | { tipo: 'texto'; texto: string }
  /** Una propuesta armada en este turno, entera: la tarjeta se dibuja sin otra llamada. */
  | { tipo: 'propuesta'; propuesta: PropuestaIaDto }
  /** Cierre normal. `tokensConsumidosMes` cambia justo en este momento. */
  | { tipo: 'fin'; tokensConsumidosMes: number }
  /**
   * Falla ocurrida **después** de que el stream ya empezó. Las que se conocen
   * antes (cuota, feature, permisos) salen como status HTTP normal, porque en
   * ese momento todavía no se escribió ninguna cabecera de stream.
   */
  | { tipo: 'error'; code: string; mensaje: string };

/**
 * Lo que devuelve mandar un mensaje. `tokensConsumidosMes` viaja en la
 * respuesta para que la pantalla pueda mostrar el consumo sin una segunda
 * llamada — es un número que cambia justamente en este momento.
 */
export interface EnviarMensajeIaResponse {
  mensajes: MensajeIaDto[];
  tokensConsumidosMes: number;
}

// --- Propuestas (fase-14-29 tanda 5) ---

export type TipoPropuestaIa =
  | 'CREAR_ACTIVIDADES'
  | 'EDITAR_ACTIVIDADES'
  /**
   * Lo produce `proponer_editar_productos` desde el fase-14-30 (decisión 7).
   * La herramienta se renombró y el valor no: el nombre de la herramienta solo
   * viaja hacia el proveedor dentro de un request, este valor está persistido.
   */
  | 'PRECIOS_TIENDA'
  | 'RENDIMIENTOS_MONEDAS'
  // fase-14-30 tanda 4 (familia catálogo).
  | 'CREAR_CONDUCTAS'
  | 'EDITAR_CONDUCTAS'
  | 'TURNOS'
  // fase-14-30 tanda 5 (familia economía).
  | 'CREAR_RECOMPENSAS'
  | 'EDITAR_RECOMPENSAS'
  | 'PRODUCTOS_TIENDA'
  | 'ETIQUETAS'
  // fase-14-30 tanda 6 (familia escala). Cubre las zonas y la base de puntos:
  // son una sola propuesta porque las dos mueven a la gente sobre la escala.
  | 'UMBRALES_ZONA'
  // fase-14-30 tanda 7 (familia personas). Organizan a quien YA está en el
  // grupo: no dan de alta ni de baja a nadie (decisión 4).
  | 'ROLES_GRUPO'
  | 'EQUIPOS'
  // fase-14-31 (alcance operativo). Los tres primeros son los que pueden
  // llevar `DELETE`; los dos últimos escriben en un ledger.
  | 'ARCHIVAR_CATALOGO'
  | 'QUITAR_MARCAS'
  | 'AJUSTES_MANUALES'
  | 'ANOTAR_REGISTROS';

/**
 * Dónde se admite un `DELETE` (fase-14-31 decisión 1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO ES LA DECISIÓN 3 DEL #30 REVISADA, NO BORRADA.
 *
 * Aquella decía *«ninguna operación de ninguna propuesta usa `DELETE`»* y era
 * correcta cuando se escribió: el #30 era sobre configurar un grupo, y
 * archivar no es configurar. El #31 amplía la capacidad y **la regla no
 * desaparece: se vuelve una lista blanca**, que es una propiedad más fuerte
 * que quedarse sin ninguna. Un `DELETE` que aparezca mañana en la familia de
 * crear actividades sigue estando prohibido, y hay un test que lo dice.
 *
 * `UMBRALES_ZONA` está acá por la decisión 8: sacar una zona del medio casi
 * siempre exige ensanchar a una vecina en el mismo movimiento, y separarlas
 * produciría propuestas correctas e inaplicables.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const TIPOS_PROPUESTA_CON_BORRADO: readonly TipoPropuestaIa[] = [
  'ARCHIVAR_CATALOGO',
  'QUITAR_MARCAS',
  'UMBRALES_ZONA',
];

/**
 * Si la tarjeta se pinta como destructiva (fase-14-31 decisión 2).
 *
 * **Se decide por las operaciones y no por el tipo**, y esa es toda la
 * diferencia: una propuesta de umbrales que solo edita rangos es una edición
 * normal, y la misma propuesta con una zona borrada adentro no lo es. La
 * tarjeta se pinta por su fila más peligrosa, así que alcanza con que haya un
 * `DELETE` para que valgan la confirmación por fila y la ausencia del
 * «Aplicar todo».
 */
export function esPropuestaDestructiva(
  operaciones: readonly OperacionPropuestaIaDto[]
): boolean {
  return operaciones.some((operacion) => operacion.metodo === 'DELETE');
}

export type EstadoPropuestaIa =
  | 'BORRADOR'
  | 'APLICADA'
  | 'APLICADA_PARCIAL'
  | 'DESCARTADA'
  | 'VENCIDA';

/**
 * Una operación de una propuesta, con la forma EXACTA del request del endpoint
 * destino (fase-14-29 decisión 6): aplicar es un `for` sobre este array, no una
 * traducción.
 *
 * **Las ejecuta el frontend con el JWT del Tutor**, contra los endpoints
 * públicos que ya existen — `ai-service` no tiene ningún camino de escritura
 * hacia otro servicio. Por eso el método y la ruta viajan en el DTO: el que va
 * a llamar es el navegador.
 */
export interface OperacionPropuestaIaDto {
  /** Id local de la operación, para reportar el resultado por fila. */
  opId: string;
  /** `DELETE` desde el fase-14-31, y solo en `TIPOS_PROPUESTA_CON_BORRADO`. */
  metodo: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Relativa a `/api`. Ej: `/activity/grupos/:id/actividades`. */
  ruta: string;
  body: unknown;
  /** Una línea legible para la tarjeta. La pantalla no muestra JSON crudo. */
  etiqueta: string;
}

/** Lo que el frontend informa por cada operación después de aplicar. */
export interface ResultadoOperacionIa {
  opId: string;
  ok: boolean;
  /** Id de lo creado o editado, si salió bien. */
  entidadId?: string;
  /** Motivo del fallo, si salió mal. Se muestra en la fila roja. */
  error?: string;
}

export interface PropuestaIaDto {
  id: string;
  conversacionId: string;
  grupoId: string;
  tipo: TipoPropuestaIa;
  operaciones: OperacionPropuestaIaDto[];
  /**
   * `VENCIDA` se DERIVA de `venceEn` al leer, no se persiste: no hay ningún
   * job que recorra la tabla marcando filas viejas.
   */
  estado: EstadoPropuestaIa;
  /** ISO-8601. 24 h desde que se armó (decisión 12). */
  venceEn: string;
  aplicadaEn: string | null;
  resultado: ResultadoOperacionIa[] | null;
  /**
   * Lo que el Tutor tiene que saber ANTES de aplicar, más allá del diff
   * (fase-14-30 tanda 6). Hoy lo usa una sola familia —la escala de zonas, la
   * única propuesta cuyo efecto no se limita a lo que pase de acá en adelante—
   * y lleva el conteo de a cuántos les cambia la zona.
   *
   * Se calcula al armar la propuesta y queda guardado con ella: reabrir la
   * conversación mañana tiene que mostrar el número que se vio al decidir, no
   * uno recalculado contra un grupo que ya cambió.
   */
  aviso: string | null;
  createdAt: string;
}

/** `POST /api/ai/propuestas/:id/aplicada`. */
export interface RegistrarPropuestaAplicadaRequest {
  resultado: ResultadoOperacionIa[];
}

export type RegistrarPropuestaAplicadaResponse = PropuestaIaDto;
