import { describe, expect, it } from 'vitest';

import { costoMicroUsd, tarifaDe, TARIFAS } from './tarifas';

describe('tarifas', () => {
  it('convierte tokens a micro-dólares con la tarifa del modelo', () => {
    // terra: $2 por millón de entrada, $12 por millón de salida.
    // 1M entrada + 1M salida = $14 = 14.000.000 µUSD
    expect(
      costoMicroUsd('gpt-5.6-terra', { entrada: 1_000_000, salida: 1_000_000, entradaCacheada: 0 })
    ).toBe(14_000_000);
  });

  it('cobra lo cacheado a su tarifa, no a la plena', () => {
    // Es lo que hace que `prompt_cache_key` valga la pena: el catálogo
    // repetido de una conversación entra 10 veces más barato.
    const sinCache = costoMicroUsd('gpt-5.6-terra', {
      entrada: 100_000,
      salida: 0,
      entradaCacheada: 0,
    });
    const conCache = costoMicroUsd('gpt-5.6-terra', {
      entrada: 100_000,
      salida: 0,
      entradaCacheada: 100_000,
    });

    expect(sinCache).toBe(200_000);
    expect(conCache).toBe(20_000);
  });

  it('nunca devuelve negativo si el proveedor reporta más cacheado que entrada', () => {
    // Defensivo: los números vienen de un tercero y un costo negativo
    // restaría del total del mes, que es peor que un dato raro.
    expect(
      costoMicroUsd('gpt-5.6-terra', { entrada: 10, salida: 0, entradaCacheada: 999 })
    ).toBeGreaterThanOrEqual(0);
  });

  /**
   * Un modelo nuevo en el `.env` no puede reportar costo 0: eso diría que el
   * asistente es gratis justo cuando nadie sabe cuánto sale. Sobreestimar es
   * el error barato.
   */
  it('un modelo desconocido usa la tarifa más cara, no cero', () => {
    const desconocido = tarifaDe('gpt-9-inventado');
    const masCara = Object.values(TARIFAS).reduce((max, t) => (t.salida > max.salida ? t : max));

    expect(desconocido).toEqual(masCara);
    expect(
      costoMicroUsd('gpt-9-inventado', { entrada: 0, salida: 1_000_000, entradaCacheada: 0 })
    ).toBeGreaterThan(0);
  });

  it('devuelve enteros (el dinero no se guarda en float)', () => {
    const costo = costoMicroUsd('gpt-5.6-luna', {
      entrada: 333,
      salida: 777,
      entradaCacheada: 11,
    });

    expect(Number.isInteger(costo)).toBe(true);
  });
});
