import { createServer, type Server } from 'node:http';

/**
 * Doble del proveedor de IA para la suite del fase-14-29 (tanda 7).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN SERVIDOR HTTP Y NO UN MOCK ADENTRO DE `ai-service`:
 *
 * un `if (esTest)` dentro de `OpenAiService` haría que **lo que corre en la
 * suite no sea lo que corre en producción**, justo en el archivo donde eso más
 * importa: el cliente HTTP, el parseo de `output`, la lectura de `usage` y la
 * contabilidad de tokens. Con `OPENAI_BASE_URL` apuntando acá, todo ese camino
 * es el mismo y lo único que cambia es a quién le habla.
 *
 * Y **no se testea que el modelo proponga cosas buenas** — eso no es
 * determinista y no es lo que se rompe en un deploy. Se testea el ruteo, la
 * validación, la cuota, el aislamiento y el aplicado parcial, que son el
 * sistema.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Una llamada a herramienta tal como la emite la Responses API. */
interface LlamadaCanned {
  nombre: string;
  argumentos: unknown;
}

/** Un turno del modelo. El stub va consumiendo el guion turno por turno. */
export interface TurnoCanned {
  /** Texto para el humano. Vacío cuando el turno es solo llamadas. */
  texto?: string;
  llamadas?: LlamadaCanned[];
  tokensEntrada?: number;
  tokensSalida?: number;
  /** Devuelve este status en vez de una respuesta (para probar el 503). */
  fallaCon?: number;
}

export interface PedidoRegistrado {
  modelo: string;
  instrucciones: string;
  entrada: unknown[];
  herramientas: string[];
  safetyIdentifier: string;
  promptCacheKey: string;
  autorizacion: string | undefined;
}

/**
 * El stub, con su guion.
 *
 * `guion` es una cola: cada llamada consume el primer turno. Cuando se acaba,
 * responde un texto de cierre — así un loop que se descontrola termina en vez
 * de colgar la suite.
 */
export class StubProveedor {
  private servidor: Server | null = null;

  private guion: TurnoCanned[] = [];

  /** Todo lo que se le pidió, para poder afirmar que NO se lo llamó. */
  readonly pedidos: PedidoRegistrado[] = [];

  get llamadas(): number {
    return this.pedidos.length;
  }

  async iniciar(puerto: number): Promise<void> {
    this.servidor = createServer((req, res) => {
      let cuerpo = '';

      req.on('data', (trozo) => (cuerpo += String(trozo)));
      req.on('end', () => {
        const pedido = JSON.parse(cuerpo || '{}') as Record<string, unknown>;

        this.pedidos.push({
          modelo: String(pedido['model'] ?? ''),
          instrucciones: String(pedido['instructions'] ?? ''),
          entrada: (pedido['input'] as unknown[]) ?? [],
          herramientas: ((pedido['tools'] as Array<{ name: string }>) ?? []).map((h) => h.name),
          safetyIdentifier: String(pedido['safety_identifier'] ?? ''),
          promptCacheKey: String(pedido['prompt_cache_key'] ?? ''),
          autorizacion: req.headers['authorization'] as string | undefined,
        });

        const turno = this.guion.shift() ?? { texto: 'No tengo nada más para agregar.' };

        if (turno.fallaCon) {
          res.writeHead(turno.fallaCon, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'stub_forzo_este_error' } }));

          return;
        }

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(this.aResponsesApi(turno)));
      });
    });

    await new Promise<void>((resolver) => this.servidor?.listen(puerto, resolver));
  }

  async detener(): Promise<void> {
    await new Promise<void>((resolver) => {
      if (!this.servidor) {
        resolver();

        return;
      }

      this.servidor.close(() => resolver());
    });
    this.servidor = null;
  }

  /** Carga un guion nuevo y olvida el anterior. No borra `pedidos`. */
  guionar(...turnos: TurnoCanned[]): void {
    this.guion = [...turnos];
  }

  olvidarPedidos(): void {
    this.pedidos.length = 0;
  }

  /**
   * La forma EXACTA de la Responses API — es lo que hace que este doble sirva.
   *
   * Un `call_id` distinto por llamada: el loop lo usa para emparejar cada
   * `function_call_output` con su pedido, y repetirlo lo colgaría.
   */
  private aResponsesApi(turno: TurnoCanned): Record<string, unknown> {
    const salida: Record<string, unknown>[] = [];

    for (const [indice, llamada] of (turno.llamadas ?? []).entries()) {
      salida.push({
        type: 'function_call',
        call_id: `call_${Date.now()}_${indice}`,
        name: llamada.nombre,
        arguments: JSON.stringify(llamada.argumentos ?? {}),
      });
    }

    if (turno.texto) {
      salida.push({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: turno.texto }],
      });
    }

    return {
      status: 'completed',
      output: salida,
      usage: {
        input_tokens: turno.tokensEntrada ?? 100,
        output_tokens: turno.tokensSalida ?? 50,
        input_tokens_details: { cached_tokens: 0 },
      },
    };
  }
}

/** Actividad válida contra el esquema Zod y contra los invariantes cruzados. */
export function actividadPropuesta(nombre: string, valorPuntos = 5): Record<string, unknown> {
  return {
    nombre,
    descripcion: null,
    tipoPuntaje: 'OPCIONAL',
    valorPuntos,
    puntosPorCumplir: 0,
    // SIN_LIMITE con los dos campos de tiempo en null: es lo que el servicio
    // normaliza en silencio (la regla que fijó la tanda 5, «se rechaza lo
    // ambiguo, se normaliza lo determinado»).
    tipoLimiteTiempo: 'SIN_LIMITE',
    deadlineHora: null,
    duracionCronometroMinutos: null,
    repeticionesMaximasSesion: 1,
    repeticionesMinimasSesion: 1,
    repeticionesMaximasSeccion: null,
    comportamientoAlCierre: 'ASUME_HECHA',
    alcance: 'INDIVIDUAL',
    bonoJefePuntos: 0,
    diasSemana: [],
    siempreVisible: false,
    rolesPermitidos: [],
    usuariosPermitidos: [],
    equiposPermitidos: [],
    vigenteDesde: null,
    vigenteHasta: null,
  };
}
