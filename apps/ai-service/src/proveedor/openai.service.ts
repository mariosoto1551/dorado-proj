import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ProveedorNoDisponibleException } from '../comun/excepciones';
import { aJsonSchema } from '../herramientas/definiciones';
import { PedidoAlProveedor, RespuestaDelProveedor } from './tipos';

/**
 * Base por defecto: la API real. `OPENAI_BASE_URL` la reemplaza y **existe
 * solo para que la suite E2E pueda stubbear al proveedor** (fase-14-29 tanda
 * 7). La alternativa era una rama `if (esTest)` acá adentro, que haría que lo
 * que corre en la suite no sea lo que corre en producción — justo en el
 * archivo donde eso más importa.
 */
const BASE_POR_DEFECTO = 'https://api.openai.com/v1';

/**
 * Timeout por llamada (Parte E, punto 9). Generoso porque un turno con
 * razonamiento tarda segundos, no milisegundos — este servicio tiene un perfil
 * de latencia distinto al del resto del monorepo y por eso está aislado.
 *
 * **Sin reintento automático**: una llamada que ya consumió tokens no se
 * repite sola. Reintentar es exactamente cómo se duplica una factura sin que
 * nadie lo pida.
 */
const TIMEOUT_MS = 60_000;

/**
 * Único punto del monorepo que habla con la API de OpenAI (fase-14-29).
 *
 * La key vive solo en el entorno de este servicio y no sale de este archivo:
 * no viaja en ningún DTO, no se loguea, y los mensajes de error que se
 * propagan hacia arriba son los de `ProveedorNoDisponibleException`, que no
 * incluyen el cuerpo de la respuesta del proveedor.
 */
@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);

  private readonly apiKey: string | undefined;

  readonly modelo: string;

  private readonly urlRespuestas: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENAI_API_KEY');
    this.modelo = config.get<string>('OPENAI_MODEL') ?? 'gpt-5.6-terra';

    const base = (config.get<string>('OPENAI_BASE_URL') ?? BASE_POR_DEFECTO).replace(/\/+$/, '');

    this.urlRespuestas = `${base}/responses`;
  }

  /**
   * Si el servicio puede llamar al proveedor. Sin key, el asistente se
   * comporta como apagado en vez de romper: la tanda 2 dejó explícito que el
   * servicio tiene que levantar igual (`.env.example` declara la key vacía).
   */
  get configurado(): boolean {
    return Boolean(this.apiKey);
  }

  async responder(pedido: PedidoAlProveedor): Promise<RespuestaDelProveedor> {
    if (!this.apiKey) {
      this.logger.error('Se intentó llamar al proveedor sin OPENAI_API_KEY configurada');

      throw new ProveedorNoDisponibleException();
    }

    const cuerpo = {
      model: pedido.modelo,
      instructions: pedido.instrucciones,
      input: pedido.entrada,
      tools: pedido.herramientas.map((herramienta) => ({
        type: 'function',
        name: herramienta.nombre,
        description: herramienta.descripcion,
        // Los metadatos internos (`formato`, `origen`, del fase-14-30) no son
        // JSON Schema y no salen de acá: lo que viaja es exactamente lo que el
        // proveedor sabe leer.
        parameters: aJsonSchema(herramienta.parametros),
      })),
      max_output_tokens: pedido.maxTokensSalida,
      // Los dos parámetros que reemplazaron al viejo `user` (Parte E, punto 7):
      // uno identifica el origen sin poder revertirse a una persona, el otro
      // hace que el catálogo repetido de una misma conversación entre por
      // caché (90% más barato el token cacheado).
      safety_identifier: pedido.safetyIdentifier,
      prompt_cache_key: pedido.promptCacheKey,
    };

    let respuesta: Response;

    try {
      respuesta = await fetch(this.urlRespuestas, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      // El mensaje del error de red se loguea pero no se propaga al cliente:
      // puede traer la URL con parámetros y no le sirve a nadie del otro lado.
      this.logger.error(
        `Llamada al proveedor fallida: ${error instanceof Error ? error.message : String(error)}`
      );

      throw new ProveedorNoDisponibleException();
    }

    const json = (await respuesta.json()) as Record<string, unknown>;

    if (!respuesta.ok) {
      this.logger.error(`El proveedor respondió ${respuesta.status}: ${this.codigoDeError(json)}`);

      throw new ProveedorNoDisponibleException();
    }

    return this.interpretar(json);
  }

  /** Solo el `code`/`type` del error, nunca el cuerpo entero (puede citar el prompt). */
  private codigoDeError(json: Record<string, unknown>): string {
    const error = json['error'] as { code?: string; type?: string } | undefined;

    return error?.code ?? error?.type ?? 'sin code';
  }

  private interpretar(json: Record<string, unknown>): RespuestaDelProveedor {
    const salida = (json['output'] as Record<string, unknown>[] | undefined) ?? [];
    const uso = (json['usage'] as Record<string, unknown> | undefined) ?? {};
    const detalleEntrada = (uso['input_tokens_details'] as Record<string, unknown>) ?? {};

    return {
      texto: this.textoDe(salida),
      llamadas: this.llamadasDe(salida),
      itemsSalida: salida,
      tokensEntrada: Number(uso['input_tokens'] ?? 0),
      // Incluye los tokens de razonamiento, que se facturan igual que el resto
      // (medido: 13 de 72 en una respuesta corta). Contabilizarlos aparte
      // subestimaría el consumo justo en los turnos que más piensan.
      tokensSalida: Number(uso['output_tokens'] ?? 0),
      tokensEntradaCacheados: Number(detalleEntrada['cached_tokens'] ?? 0),
      incompleta: json['status'] === 'incomplete',
    };
  }

  private textoDe(salida: Record<string, unknown>[]): string {
    return salida
      .filter((item) => item['type'] === 'message')
      .flatMap((item) => (item['content'] as Record<string, unknown>[] | undefined) ?? [])
      .filter((parte) => parte['type'] === 'output_text')
      .map((parte) => String(parte['text'] ?? ''))
      .join('')
      .trim();
  }

  /**
   * **Un turno puede traer VARIAS llamadas** — verificado contra la API real:
   * una pregunta simple devolvió dos `function_call` en la misma respuesta.
   * Asumir una sola por turno descartaría trabajo que el modelo pidió y dejaría
   * `call_id` sin responder, que es como se cuelga un loop de herramientas.
   */
  private llamadasDe(salida: Record<string, unknown>[]): RespuestaDelProveedor['llamadas'] {
    return salida
      .filter((item) => item['type'] === 'function_call')
      .map((item) => ({
        callId: String(item['call_id'] ?? ''),
        nombre: String(item['name'] ?? ''),
        argumentos: this.argumentosDe(item['arguments']),
      }));
  }

  /**
   * Los argumentos llegan como string JSON generado por el modelo: puede venir
   * mal formado. Un parseo fallido devuelve `{}` y la herramienta corre con sus
   * defaults, en vez de tirar abajo el turno — el ejecutor ya sanea cada campo.
   */
  private argumentosDe(crudos: unknown): Record<string, unknown> {
    if (typeof crudos !== 'string' || crudos.trim() === '') {
      return {};
    }

    try {
      const parseado = JSON.parse(crudos) as unknown;

      return typeof parseado === 'object' && parseado !== null
        ? (parseado as Record<string, unknown>)
        : {};
    } catch {
      this.logger.warn('El modelo mandó argumentos que no son JSON válido — se usan los defaults');

      return {};
    }
  }
}
