import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProveedorNoDisponibleException } from '../comun/excepciones';
import { OpenAiService } from './openai.service';

function crearServicio(valores: Record<string, string | undefined> = {}) {
  const config = {
    get: (clave: string) =>
      ({ OPENAI_API_KEY: 'sk-proj-' + 'x'.repeat(40), OPENAI_MODEL: 'gpt-5.6-terra', ...valores })[
        clave
      ],
  } as unknown as ConfigService;

  return new OpenAiService(config);
}

function responderCon(json: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status, json: async () => json }) as unknown as Response)
  );
}

const PEDIDO = {
  modelo: 'gpt-5.6-terra',
  instrucciones: 'sos un asistente',
  entrada: [{ role: 'user' as const, content: 'hola' }],
  herramientas: [],
  maxTokensSalida: 4000,
  safetyIdentifier: 'hash',
  promptCacheKey: 'org:1:grupo:1',
};

/**
 * La forma de estas respuestas está copiada de llamadas reales a la API
 * (2026-08-04), no inventada: es el punto donde este servicio se acopla a un
 * tercero, y un doble que no se parece al original no prueba nada.
 */
describe('OpenAiService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin API key no llama y lanza PROVEEDOR_NO_DISPONIBLE', async () => {
    const servicio = crearServicio({ OPENAI_API_KEY: undefined });

    responderCon({});
    expect(servicio.configurado).toBe(false);
    await expect(servicio.responder(PEDIDO)).rejects.toBeInstanceOf(
      ProveedorNoDisponibleException
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('extrae el texto de los ítems de mensaje', async () => {
    responderCon({
      status: 'completed',
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', content: [{ type: 'output_text', text: '  Hola  ' }] },
      ],
      usage: { input_tokens: 97, output_tokens: 72, input_tokens_details: { cached_tokens: 30 } },
    });

    const respuesta = await crearServicio().responder(PEDIDO);

    expect(respuesta.texto).toBe('Hola');
    expect(respuesta.tokensEntrada).toBe(97);
    // Los de razonamiento ya vienen dentro de output_tokens y se facturan:
    // contabilizarlos aparte subestimaría los turnos que más piensan.
    expect(respuesta.tokensSalida).toBe(72);
    expect(respuesta.tokensEntradaCacheados).toBe(30);
  });

  /**
   * Medido contra la API real: una sola pregunta devolvió DOS `function_call`
   * en el mismo turno. Si el parseo se quedara con el primero, quedaría un
   * `call_id` sin responder.
   */
  it('devuelve TODAS las function_call de un turno', async () => {
    responderCon({
      status: 'completed',
      output: [
        { type: 'reasoning', summary: [] },
        {
          type: 'function_call',
          call_id: 'call_a',
          name: 'listar_actividades',
          arguments: '{"estado":"ACTIVA"}',
        },
        { type: 'function_call', call_id: 'call_b', name: 'listar_conductas', arguments: '{}' },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const respuesta = await crearServicio().responder(PEDIDO);

    expect(respuesta.llamadas).toEqual([
      { callId: 'call_a', nombre: 'listar_actividades', argumentos: { estado: 'ACTIVA' } },
      { callId: 'call_b', nombre: 'listar_conductas', argumentos: {} },
    ]);
    // Los ítems crudos se conservan para reenviarlos: recortarlos rompe la
    // continuidad del razonamiento entre turnos.
    expect(respuesta.itemsSalida).toHaveLength(3);
  });

  it('unos argumentos mal formados no tiran abajo el turno', async () => {
    responderCon({
      status: 'completed',
      output: [
        { type: 'function_call', call_id: 'c', name: 'listar_actividades', arguments: '{roto' },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const respuesta = await crearServicio().responder(PEDIDO);

    // La herramienta corre con sus defaults; el ejecutor ya sanea cada campo.
    expect(respuesta.llamadas[0].argumentos).toEqual({});
  });

  it('marca incompleta cuando el proveedor cortó por max_output_tokens', async () => {
    responderCon({ status: 'incomplete', output: [], usage: { input_tokens: 9, output_tokens: 4000 } });

    const respuesta = await crearServicio().responder(PEDIDO);

    // No es un error: los tokens se pagaron y hay que contabilizarlos.
    expect(respuesta.incompleta).toBe(true);
    expect(respuesta.tokensSalida).toBe(4000);
  });

  it('un error del proveedor no filtra el cuerpo de la respuesta hacia arriba', async () => {
    responderCon(
      { error: { code: 'rate_limit_exceeded', message: 'tu prompt decía: <secreto>' } },
      false,
      429
    );

    const error = await crearServicio()
      .responder(PEDIDO)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProveedorNoDisponibleException);
    expect(JSON.stringify(error)).not.toContain('secreto');
  });

  it('manda los dos identificadores y el tope de salida, y nunca la key en el body', async () => {
    responderCon({ status: 'completed', output: [], usage: {} });

    await crearServicio().responder(PEDIDO);

    const [, opciones] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const cuerpo = JSON.parse(String(opciones.body));

    expect(cuerpo.safety_identifier).toBe('hash');
    expect(cuerpo.prompt_cache_key).toBe('org:1:grupo:1');
    expect(cuerpo.max_output_tokens).toBe(4000);
    // La key va en el header Authorization y en ningún otro lado.
    expect(String(opciones.body)).not.toContain('sk-proj-');
  });
});
