import { describe, expect, it } from 'vitest';

import {
  SERVICIOS_INTERNOS,
  TABLA_RUTEO,
  TIMEOUT_PROXY_AI_MS,
  TIMEOUT_PROXY_DEFAULT_MS,
} from './tabla-ruteo';

describe('tabla de ruteo', () => {
  it('todos los prefijos son únicos y cuelgan de /api', () => {
    const prefijos = TABLA_RUTEO.map((ruta) => ruta.prefijo);

    expect(new Set(prefijos).size).toBe(prefijos.length);

    for (const prefijo of prefijos) {
      expect(prefijo.startsWith('/api/'), prefijo).toBe(true);
    }
  });

  it('cada servicio de la tabla está en la lista que pingea el health', () => {
    // Un servicio ruteado que el health no mira se cae en silencio — que es
    // exactamente lo que le pasó a `ai` hasta la tanda 3 del fase-14-29.
    for (const ruta of TABLA_RUTEO) {
      expect(SERVICIOS_INTERNOS, ruta.prefijo).toContain(ruta.servicio);
    }
  });

  /**
   * fase-14-29: el timeout del proxy pasó a ser POR RUTA.
   *
   * Lo destapó una verificación real del asistente que tardó 30,0 s y se comió
   * un 502 mientras `ai-service` seguía trabajando **y gastando tokens**: el
   * Tutor veía un error y la plataforma pagaba igual.
   */
  describe('timeout por ruta', () => {
    it('solo /api/ai declara un timeout propio', () => {
      const conTimeoutPropio = TABLA_RUTEO.filter((ruta) => ruta.timeoutMs !== undefined);

      expect(conTimeoutPropio.map((ruta) => ruta.prefijo)).toEqual(['/api/ai']);
    });

    it('el resto conserva el default de la spec de Fase 3', () => {
      // No es «subamos el timeout global»: que un servicio interno tarde más de
      // 30 s significa que está roto, y eso se quiere seguir viendo.
      expect(TIMEOUT_PROXY_DEFAULT_MS).toBe(30_000);

      for (const ruta of TABLA_RUTEO.filter((otra) => otra.prefijo !== '/api/ai')) {
        expect(ruta.timeoutMs, ruta.prefijo).toBeUndefined();
      }
    });

    it('el de /api/ai es mayor que el default (varias llamadas de 60 s encadenadas)', () => {
      expect(TIMEOUT_PROXY_AI_MS).toBeGreaterThan(TIMEOUT_PROXY_DEFAULT_MS);
    });
  });
});
