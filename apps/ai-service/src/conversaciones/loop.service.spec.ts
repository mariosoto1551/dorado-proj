import { describe, expect, it, vi } from 'vitest';

import type { ContextoHerramienta } from '../comun/acceso-grupo.service';
import type { HerramientasService } from '../herramientas/herramientas.service';
import type { OpenAiService } from '../proveedor/openai.service';
import type { RespuestaDelProveedor } from '../proveedor/tipos';
import type { PropuestasService } from '../propuestas/propuestas.service';
import { ErrorConConsumo, LoopService } from './loop.service';

const CONTEXTO: ContextoHerramienta = { organizacionId: 'org-1', grupoId: 'grupo-1' };

const IDS = { safetyIdentifier: 'hash', promptCacheKey: 'org:org-1:grupo:grupo-1' };

function respuesta(parcial: Partial<RespuestaDelProveedor> = {}): RespuestaDelProveedor {
  return {
    texto: '',
    llamadas: [],
    itemsSalida: [],
    tokensEntrada: 100,
    tokensSalida: 50,
    tokensEntradaCacheados: 0,
    incompleta: false,
    ...parcial,
  };
}

function crearMocks(respuestas: RespuestaDelProveedor[]) {
  let vuelta = 0;
  const responder = vi.fn(async () => {
    const siguiente = respuestas[Math.min(vuelta, respuestas.length - 1)];

    vuelta += 1;

    return siguiente;
  });
  const proveedor = { responder, modelo: 'gpt-5.6-terra' } as unknown as OpenAiService;
  const herramientas = {
    ejecutar: vi.fn(async () => ({ ok: true as const, datos: { filas: [1, 2, 3] } })),
  } as unknown as HerramientasService;

  const propuestas = {
    armar: vi.fn(async () => ({
      ok: true as const,
      propuestaId: 'prop-1',
      cantidad: 2,
      mensaje: 'Propuesta armada con 2 operación(es).',
    })),
  } as unknown as PropuestasService;

  return {
    proveedor,
    herramientas,
    propuestas,
    servicio: new LoopService(proveedor, herramientas, propuestas),
  };
}

describe('LoopService', () => {
  it('devuelve el texto cuando el modelo contesta sin pedir herramientas', async () => {
    const { servicio, herramientas } = crearMocks([respuesta({ texto: 'Hola' })]);

    const resultado = await servicio.ejecutar([], CONTEXTO, IDS, 'conv-1');

    expect(resultado.texto).toBe('Hola');
    expect(resultado.tokensTotales).toBe(150);
    expect(herramientas.ejecutar).not.toHaveBeenCalled();
  });

  /**
   * El caso que encontró probar contra la API real: una sola pregunta devolvió
   * DOS `function_call` en el mismo turno. Un loop que asume una por vuelta
   * deja `call_id` sin responder, que es como se cuelga.
   */
  it('ejecuta TODAS las herramientas de un turno, no solo la primera', async () => {
    const { servicio, herramientas } = crearMocks([
      respuesta({
        llamadas: [
          { callId: 'c1', nombre: 'listar_actividades', argumentos: {} },
          { callId: 'c2', nombre: 'listar_conductas', argumentos: {} },
        ],
        itemsSalida: [{ type: 'function_call', call_id: 'c1' }],
      }),
      respuesta({ texto: 'Listo' }),
    ]);

    const resultado = await servicio.ejecutar([], CONTEXTO, IDS, 'conv-1');

    expect(herramientas.ejecutar).toHaveBeenCalledTimes(2);
    expect(resultado.texto).toBe('Listo');
    // Dos turnos del modelo + dos filas de herramienta en el ledger.
    expect(resultado.mensajes.filter((m) => m.rol === 'HERRAMIENTA')).toHaveLength(2);
    expect(resultado.mensajes.filter((m) => m.rol === 'ASISTENTE')).toHaveLength(2);
  });

  it('responde cada llamada con su call_id y envuelve los datos como datos', async () => {
    const { servicio, proveedor } = crearMocks([
      respuesta({ llamadas: [{ callId: 'c1', nombre: 'listar_actividades', argumentos: {} }] }),
      respuesta({ texto: 'ok' }),
    ]);

    await servicio.ejecutar([{ role: 'user', content: 'hola' }], CONTEXTO, IDS, 'conv-1');

    const segundoPedido = vi.mocked(proveedor.responder).mock.calls[1][0];
    const salida = segundoPedido.entrada.find(
      (item) => (item as Record<string, unknown>)['type'] === 'function_call_output'
    ) as Record<string, unknown>;

    expect(salida['call_id']).toBe('c1');
    // Decisión 10: lo que sale de la base del grupo entra como DATO delimitado,
    // nunca suelto donde pueda leerse como instrucción.
    expect(String(salida['output'])).toContain('<datos_del_grupo herramienta="listar_actividades">');
  });

  it('corta a las 8 iteraciones si el modelo no deja de pedir herramientas', async () => {
    // Un modelo en bucle es dinero real: el tope no es una optimización.
    const { servicio, proveedor } = crearMocks([
      respuesta({ llamadas: [{ callId: 'c', nombre: 'listar_actividades', argumentos: {} }] }),
    ]);

    const resultado = await servicio.ejecutar([], CONTEXTO, IDS, 'conv-1');

    expect(proveedor.responder).toHaveBeenCalledTimes(8);
    expect(resultado.cortadoPorTope).toBe(true);
    expect(resultado.texto).toContain('frenar');
  });

  describe('contabilidad', () => {
    it('calcula el costo con la tarifa del modelo y descuenta lo cacheado', async () => {
      const { servicio } = crearMocks([
        respuesta({
          texto: 'ok',
          tokensEntrada: 1_000_000,
          tokensSalida: 0,
          tokensEntradaCacheados: 500_000,
        }),
      ]);

      const resultado = await servicio.ejecutar([], CONTEXTO, IDS, 'conv-1');

      // terra: 500k plenos × $2/1M + 500k cacheados × $0,20/1M = $1,10 = 1.100.000 µUSD
      expect(resultado.mensajes[0].costoMicroUsd).toBe(1_100_000);
    });

    it('las filas de herramienta no suman tokens (se contarían dos veces)', async () => {
      const { servicio } = crearMocks([
        respuesta({ llamadas: [{ callId: 'c', nombre: 'listar_actividades', argumentos: {} }] }),
        respuesta({ texto: 'ok' }),
      ]);

      const resultado = await servicio.ejecutar([], CONTEXTO, IDS, 'conv-1');
      const deHerramienta = resultado.mensajes.filter((m) => m.rol === 'HERRAMIENTA');

      // Lo que cuesta una herramienta es que su salida entre como ENTRADA en el
      // turno siguiente, y eso ya lo contabiliza el turno siguiente.
      expect(deHerramienta.every((m) => m.tokensEntrada === 0 && m.tokensSalida === 0)).toBe(true);
      expect(resultado.tokensTotales).toBe(300);
    });

    /**
     * Parte E, punto 6: los tokens de entrada se pagan aunque la llamada
     * falle. Si esto se contabilizara solo al terminar bien, cortar la
     * conexión a mitad sería una forma de consumir gratis.
     */
    it('un fallo en la vuelta 2 conserva lo consumido en la vuelta 1', async () => {
      let vuelta = 0;
      const proveedor = {
        modelo: 'gpt-5.6-terra',
        responder: vi.fn(async () => {
          vuelta += 1;

          if (vuelta === 1) {
            return respuesta({
              llamadas: [{ callId: 'c', nombre: 'listar_actividades', argumentos: {} }],
            });
          }

          throw new Error('503 del proveedor');
        }),
      } as unknown as OpenAiService;
      const herramientas = {
        ejecutar: vi.fn(async () => ({ ok: true as const, datos: {} })),
      } as unknown as HerramientasService;
      const propuestas = { armar: vi.fn() } as unknown as PropuestasService;
      const servicio = new LoopService(proveedor, herramientas, propuestas);

      const error = await servicio.ejecutar([], CONTEXTO, IDS, 'conv-1').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ErrorConConsumo);
      const parcial = (error as ErrorConConsumo).parcial;

      expect(parcial.tokensTotales).toBe(150);
      expect(parcial.mensajes).toHaveLength(2);
    });
  });

  it('un error de herramienta vuelve al modelo sin envolver (no es un dato del grupo)', async () => {
    const { servicio, proveedor, herramientas } = crearMocks([
      respuesta({ llamadas: [{ callId: 'c', nombre: 'inventada', argumentos: {} }] }),
      respuesta({ texto: 'ah, perdón' }),
    ]);

    vi.mocked(herramientas.ejecutar).mockResolvedValueOnce({
      ok: false,
      error: 'No existe una herramienta llamada "inventada".',
    });

    const resultado = await servicio.ejecutar([], CONTEXTO, IDS, 'conv-1');
    const segundoPedido = vi.mocked(proveedor.responder).mock.calls[1][0];
    const salida = segundoPedido.entrada.find(
      (item) => (item as Record<string, unknown>)['type'] === 'function_call_output'
    ) as Record<string, unknown>;

    expect(String(salida['output'])).not.toContain('<datos_del_grupo');
    expect(resultado.texto).toBe('ah, perdón');
  });

  it('un turno sin texto ni herramientas no deja al usuario sin respuesta', async () => {
    const { servicio } = crearMocks([respuesta({ texto: '', incompleta: true })]);

    const resultado = await servicio.ejecutar([], CONTEXTO, IDS, 'conv-1');

    expect(resultado.texto).not.toBe('');
    expect(resultado.texto).toContain('sin espacio');
  });
});
