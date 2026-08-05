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
