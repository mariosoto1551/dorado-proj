import { describe, expect, it } from 'vitest';

import {
  DefinicionHerramienta,
  HERRAMIENTAS_LECTURA,
  NOMBRES_HERRAMIENTAS_LECTURA,
} from './definiciones';

/**
 * TEST ESTRUCTURAL 1 de la tanda 3 (fase-14-29 Parte E, punto 2).
 *
 * No verifica una función: verifica que **la forma** de las herramientas hace
 * imposible el cross-tenant por argumento del modelo. Si alguien agrega
 * `grupoId` a una definición "para que sea más flexible", esto se pone rojo
 * antes de que el commit salga de la máquina.
 *
 * Es deliberadamente un test sobre datos y no sobre comportamiento: el
 * comportamiento se puede arreglar con un chequeo que alguien se puede olvidar
 * de escribir; la forma no.
 */
const PROHIBIDO_EN_PARAMETROS = /organizacion|organizationId|grupo|tenant|usuarioId|principal/i;

describe('definiciones de herramientas — invariantes estructurales', () => {
  it('ninguna herramienta declara un parámetro de tenant (decisión 9)', () => {
    const infractoras: string[] = [];

    for (const herramienta of HERRAMIENTAS_LECTURA) {
      for (const nombreParametro of Object.keys(herramienta.parametros.properties)) {
        if (PROHIBIDO_EN_PARAMETROS.test(nombreParametro)) {
          infractoras.push(`${herramienta.nombre}.${nombreParametro}`);
        }
      }
    }

    // El mensaje importa: quien rompa esto tiene que leer POR QUÉ, no solo QUÉ.
    expect(
      infractoras,
      'El tenant nunca es un argumento de una herramienta (fase-14-29 decisión 9): ' +
        'lo inyecta el servicio desde el JWT. Si una herramienta necesita el grupo ' +
        'como parámetro, el problema es la herramienta, no esta regla.'
    ).toEqual([]);
  });

  it('ninguna herramienta de lectura tiene parámetros obligatorios', () => {
    // Corolario del anterior: si algo fuera obligatorio, sería contexto — y el
    // contexto lo pone el servicio. Un `required` no vacío es la señal
    // temprana de que se está por colar un identificador.
    for (const herramienta of HERRAMIENTAS_LECTURA) {
      expect(herramienta.parametros.required, herramienta.nombre).toEqual([]);
    }
  });

  it('ninguna herramienta acepta propiedades extra', () => {
    // `additionalProperties: false` evita que el modelo mande campos que nadie
    // declaró y que alguien, más adelante, lea "porque ya venían".
    for (const herramienta of HERRAMIENTAS_LECTURA) {
      expect(herramienta.parametros.additionalProperties, herramienta.nombre).toBe(false);
    }
  });

  it('están las ocho de la spec, con nombres únicos', () => {
    expect(NOMBRES_HERRAMIENTAS_LECTURA).toEqual([
      'listar_actividades',
      'listar_conductas',
      'listar_participantes',
      'listar_umbrales_zona',
      'resumen_puntajes',
      'listar_recompensas',
      'listar_rendimientos_monedas',
      'resumen_cumplimiento',
    ]);
    expect(new Set(NOMBRES_HERRAMIENTAS_LECTURA).size).toBe(HERRAMIENTAS_LECTURA.length);
  });

  it('ninguna herramienta de esta lista escribe (todas son de lectura)', () => {
    // El nombre es contrato: `proponer_*` son las de la tanda 5, que tampoco
    // escriben pero sí construyen una Propuesta. Cualquier verbo de escritura
    // acá significaría que la decisión 6 se rompió.
    const verbosDeEscritura = /^(crear|editar|borrar|eliminar|aplicar|actualizar|guardar)_/;

    for (const herramienta of HERRAMIENTAS_LECTURA) {
      expect(verbosDeEscritura.test(herramienta.nombre), herramienta.nombre).toBe(false);
    }
  });

  it('cada herramienta tiene una descripción útil para el modelo', () => {
    // Una descripción pobre no rompe el build pero sí el producto: el modelo
    // elige la herramienta leyendo esto y nada más.
    const suficientementeDescriptiva = (herramienta: DefinicionHerramienta): boolean =>
      herramienta.descripcion.length >= 60;

    for (const herramienta of HERRAMIENTAS_LECTURA) {
      expect(suficientementeDescriptiva(herramienta), herramienta.nombre).toBe(true);
    }
  });
});
