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
  /** Si ya se aceptó el aviso sobre los datos que se envían al proveedor. */
  avisoAceptado: boolean;
  /** ISO-8601, null si nunca se aceptó. */
  aceptoAvisoEn: string | null;
  /** Techo mensual de tokens de la organización. null = sin límite. */
  cuotaTokensMensuales: number | null;
  /**
   * Tokens (entrada + salida) consumidos en el mes calendario en curso.
   * Derivado sumando el ledger de mensajes, no un contador (decisión 8).
   */
  tokensConsumidosMes: number;
  /**
   * Si el asistente puede usarse AHORA: exige plan, switch prendido y cuota
   * disponible. Es el único campo que la pantalla necesita mirar para decidir
   * si habilita el chat — los otros son para explicar por qué no.
   */
  puedeUsarse: boolean;
}

/** `PUT /api/ai/configuracion` — solo ORG_ADMIN. */
export interface CambiarConfiguracionIaRequest {
  habilitada: boolean;
  /**
   * Obligatorio en `true` para habilitar por primera vez (decisión 5).
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
  | 'PRECIOS_TIENDA'
  | 'RENDIMIENTOS_MONEDAS';

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
  metodo: 'POST' | 'PATCH' | 'PUT';
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
  createdAt: string;
}

/** `POST /api/ai/propuestas/:id/aplicada`. */
export interface RegistrarPropuestaAplicadaRequest {
  resultado: ResultadoOperacionIa[];
}

export type RegistrarPropuestaAplicadaResponse = PropuestaIaDto;
