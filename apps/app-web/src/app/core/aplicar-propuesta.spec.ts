import { describe, expect, it, vi } from 'vitest';

import type { OperacionPropuestaIaDto, ResultadoOperacionIa } from '@dorado/shared-types';

import { aplicarOperaciones, mensajeDeFallo, resumirAplicado } from './aplicar-propuesta';

function operaciones(cuantas: number): OperacionPropuestaIaDto[] {
  return Array.from({ length: cuantas }, (_, i) => ({
    opId: `op-${i + 1}`,
    metodo: 'POST' as const,
    ruta: '/activity/grupos/grupo-1/actividades',
    body: { nombre: `Actividad ${i + 1}` },
    etiqueta: `Crear «Actividad ${i + 1}»`,
  }));
}

describe('aplicarOperaciones', () => {
  it('ejecuta cada operación tal cual viene, sin traducir un solo campo', async () => {
    const ejecutar = vi.fn(async () => ({ id: 'nuevo' }));
    const ops = operaciones(2);

    await aplicarOperaciones(ops, ejecutar);

    // La prueba de que aplicar es un `for`: lo que se ejecuta es exactamente
    // el objeto que guardó el servidor. Un `if` acá significaría que el
    // servidor dejó de guardar la forma del endpoint destino.
    expect(ejecutar).toHaveBeenNthCalledWith(1, ops[0]);
    expect(ejecutar).toHaveBeenNthCalledWith(2, ops[1]);
  });

  /**
   * El criterio de aceptación 7 de la spec, escrito como test: 3 actividades,
   * falla la segunda → **2 creadas**, no 0.
   */
  it('una que falla NO aborta las que vienen después', async () => {
    const ejecutar = vi.fn(async (operacion: OperacionPropuestaIaDto) => {
      if (operacion.opId === 'op-2') {
        throw { status: 400, error: { code: 'VALIDACION', message: 'El nombre ya existe' } };
      }

      return { id: `id-${operacion.opId}` };
    });

    const resultados = await aplicarOperaciones(operaciones(3), ejecutar);

    expect(ejecutar).toHaveBeenCalledTimes(3);
    expect(resultados).toEqual([
      { opId: 'op-1', ok: true, entidadId: 'id-op-1' },
      { opId: 'op-2', ok: false, error: 'El nombre ya existe' },
      { opId: 'op-3', ok: true, entidadId: 'id-op-3' },
    ]);
  });

  it('reporta cada fila apenas termina, no todas al final', async () => {
    const vistas: string[] = [];

    await aplicarOperaciones(operaciones(3), async () => ({ id: 'x' }), {
      onFila: (resultado: ResultadoOperacionIa) => vistas.push(resultado.opId),
    });

    expect(vistas).toEqual(['op-1', 'op-2', 'op-3']);
  });

  it('«Aplicar seleccionadas» ejecuta solo las elegidas', async () => {
    const ejecutar = vi.fn(async () => ({ id: 'x' }));

    const resultados = await aplicarOperaciones(operaciones(3), ejecutar, {
      soloEstas: ['op-1', 'op-3'],
    });

    expect(ejecutar).toHaveBeenCalledTimes(2);
    expect(resultados.map((r) => r.opId)).toEqual(['op-1', 'op-3']);
  });

  it('una respuesta sin id no es un fallo', async () => {
    // El PUT de rendimientos del #28 no devuelve una entidad con id.
    const resultados = await aplicarOperaciones(operaciones(1), async () => null);

    expect(resultados[0]).toEqual({ opId: 'op-1', ok: true });
  });

  it('sin seleccionar nada no ejecuta nada', async () => {
    const ejecutar = vi.fn(async () => ({ id: 'x' }));

    const resultados = await aplicarOperaciones(operaciones(3), ejecutar, { soloEstas: [] });

    expect(ejecutar).not.toHaveBeenCalled();
    expect(resultados).toEqual([]);
  });
});

describe('mensajeDeFallo', () => {
  it('prefiere el mensaje de la API, que dice QUÉ está mal', () => {
    expect(
      mensajeDeFallo({
        status: 402,
        error: { code: 'LIMITE_ALCANZADO', message: 'El plan permite hasta 20 actividades' },
      })
    ).toBe('El plan permite hasta 20 actividades');
  });

  it('cae al code cuando no hay mensaje', () => {
    expect(mensajeDeFallo({ status: 409, error: { code: 'CONFLICTO' } })).toBe('CONFLICTO');
  });

  it('cae al status cuando no hay sobre de error', () => {
    // Un «Error 400» no le sirve a nadie para decidir si reintentar, pero es
    // mejor que un mensaje genérico que además esconde el status.
    expect(mensajeDeFallo({ status: 400 })).toBe('La API respondió 400');
  });

  it('nunca se queda sin texto', () => {
    expect(mensajeDeFallo(new Error('boom'))).toBe('No se pudo aplicar');
    expect(mensajeDeFallo(null)).toBe('No se pudo aplicar');
  });
});

describe('resumirAplicado', () => {
  it('cuenta las que salieron bien y las que no', () => {
    expect(
      resumirAplicado([
        { opId: 'a', ok: true },
        { opId: 'b', ok: false, error: 'x' },
        { opId: 'c', ok: true },
      ])
    ).toEqual({ ok: 2, fallaron: 1, todoBien: false });
  });

  it('todo bien solo cuando no falló ninguna', () => {
    expect(resumirAplicado([{ opId: 'a', ok: true }]).todoBien).toBe(true);
  });
});
