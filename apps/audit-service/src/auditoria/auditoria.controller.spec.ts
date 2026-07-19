import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

import { AuditoriaController } from './auditoria.controller';

/**
 * Criterio de aceptación 5 (spec fase-09): audit-service es de SOLO lectura —
 * no debe existir NINGÚN POST/PATCH/DELETE en su controller. Se verifica por
 * reflexión sobre la metadata de rutas de Nest (no por inspección de texto),
 * así cualquier método de escritura agregado por error rompe este test.
 */
describe('AuditoriaController — solo lectura (criterio 5)', () => {
  it('todos los handlers HTTP son GET (ningún POST/PATCH/DELETE/PUT)', () => {
    const prototipo = AuditoriaController.prototype as unknown as Record<string, object>;
    const handlersHttp = Object.getOwnPropertyNames(prototipo)
      .filter((nombre) => nombre !== 'constructor' && typeof prototipo[nombre] === 'function')
      .filter((nombre) => Reflect.getMetadata(METHOD_METADATA, prototipo[nombre]) !== undefined);

    // Debe haber al menos los dos GET de la spec.
    expect(handlersHttp.length).toBeGreaterThanOrEqual(2);

    for (const nombre of handlersHttp) {
      const metodo = Reflect.getMetadata(METHOD_METADATA, prototipo[nombre]);

      expect(metodo, `El handler ${nombre} debe ser GET`).toBe(RequestMethod.GET);
    }
  });
});
