import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConfigService } from '@nestjs/config';

import { ScoringClientService } from './scoring-client.service';

/**
 * fase-14-34 (segunda vuelta) — lo que se prueba acá es **la diferencia entre
 * «no hubo ajustes» y «no pude preguntar»**.
 *
 * Es la clase de distinción que se pierde sola en el primer refactor si no hay
 * un test que la sostenga: las dos ramas devuelven una lista vacía, y solo el
 * `disponible` las separa.
 */
function crear(): ScoringClientService {
  const config = {
    getOrThrow: (clave: string) =>
      clave === 'SCORING_INTERNAL_URL' ? 'http://scoring:3005' : 'secreto-de-prueba',
  } as unknown as ConfigService;

  return new ScoringClientService(config);
}

const PEDIDO = {
  organizacionId: 'org-1',
  grupoId: 'grupo-1',
  sesionId: 'sesion-1',
  limite: 51,
};

describe('ScoringClientService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('con respuesta buena devuelve los ajustes y se declara disponible', async () => {
    const fila = { id: 'evento-1', usuarioId: 'usuario-1', puntos: 10 };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [fila] })
    );

    const resultado = await crear().ajustesDeLaSesion(PEDIDO);

    expect(resultado.disponible).toBe(true);
    expect(resultado.ajustes).toEqual([fila]);
  });

  it('sin ajustes sigue estando disponible: vacío no es lo mismo que caído', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    const resultado = await crear().ajustesDeLaSesion(PEDIDO);

    expect(resultado).toEqual({ ajustes: [], disponible: true });
  });

  it('con un 500 de scoring NO tira: devuelve vacío marcado como no disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const resultado = await crear().ajustesDeLaSesion(PEDIDO);

    expect(resultado).toEqual({ ajustes: [], disponible: false });
  });

  it('si la red se cae tampoco tira: el historial no muere por su cuarta fuente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const resultado = await crear().ajustesDeLaSesion(PEDIDO);

    expect(resultado).toEqual({ ajustes: [], disponible: false });
  });

  it('manda el tenant, el cursor y el secreto interno en la llamada', async () => {
    const fetchFalso = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchFalso);

    await crear().ajustesDeLaSesion({
      ...PEDIDO,
      usuarioId: 'usuario-9',
      cursor: { createdAt: new Date('2026-08-15T13:00:00.000Z'), id: 'evento-5' },
    });

    const [url, opciones] = fetchFalso.mock.calls[0];

    expect(url).toContain('/internal/scoring/grupos/grupo-1/sesiones/sesion-1/ajustes');
    expect(url).toContain('organizacionId=org-1');
    expect(url).toContain('usuarioId=usuario-9');
    expect(url).toContain('cursorId=evento-5');
    expect(opciones.headers['x-internal-secret']).toBe('secreto-de-prueba');
  });
});
