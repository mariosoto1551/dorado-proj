import { DefinicionHerramienta } from '../herramientas/definiciones';

/**
 * Tipos del proveedor (fase-14-29 tanda 4).
 *
 * Se declaran acá, propios y mínimos —solo lo que este servicio usa— en vez de
 * importar los del SDK. Dos razones: el catálogo de herramientas ya está
 * declarado en tipos propios (`definiciones.ts`) y traducirlo en un solo lugar
 * mantiene el resto del servicio sin saber de qué proveedor se trata; y un
 * cambio de SDK toca este archivo y ninguno más.
 */

/** Un ítem de la conversación tal como se le manda al proveedor. */
export type ItemEntrada =
  | { role: 'user' | 'assistant'; content: string }
  | { type: 'function_call_output'; call_id: string; output: string }
  // Los ítems que devolvió el proveedor se reenvían tal cual (incluidos los de
  // razonamiento): recortarlos rompe la continuidad del razonamiento entre
  // turnos, que es justo lo que hace que el modelo no se olvide de por qué
  // llamó a una herramienta.
  | Record<string, unknown>;

/** Una herramienta que el modelo quiere ejecutar. */
export interface LlamadaHerramienta {
  callId: string;
  nombre: string;
  argumentos: Record<string, unknown>;
}

export interface PedidoAlProveedor {
  modelo: string;
  /** System prompt. Va aparte de la conversación, no como un mensaje más. */
  instrucciones: string;
  entrada: ItemEntrada[];
  herramientas: DefinicionHerramienta[];
  maxTokensSalida: number;
  /** SHA-256 de `organizacionId:usuarioId`. Estable y no reversible a una persona. */
  safetyIdentifier: string;
  /** Lo que hace que el catálogo repetido de una conversación entre por caché. */
  promptCacheKey: string;
}

export interface RespuestaDelProveedor {
  /** Texto para el humano. Vacío cuando el turno fue solo llamadas a herramientas. */
  texto: string;
  llamadas: LlamadaHerramienta[];
  /** Los ítems crudos de salida, para reenviarlos en el turno siguiente. */
  itemsSalida: Record<string, unknown>[];
  tokensEntrada: number;
  tokensSalida: number;
  tokensEntradaCacheados: number;
  /**
   * El proveedor cortó por `max_output_tokens` antes de terminar. Se distingue
   * de un error porque los tokens se pagaron igual y hay que contabilizarlos.
   */
  incompleta: boolean;
}
