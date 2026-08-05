import { describe, expect, it } from 'vitest';

import {
  HERRAMIENTAS_PROPUESTA,
  NOMBRES_HERRAMIENTAS_PROPUESTA,
} from '../propuestas/definiciones-propuesta';
import {
  DefinicionHerramienta,
  EsquemaParametros,
  HERRAMIENTAS_LECTURA,
  NOMBRES_HERRAMIENTAS_LECTURA,
  PropiedadEsquema,
} from './definiciones';

/** Todas las herramientas que el modelo puede llamar, de las dos familias. */
const TODAS = [...HERRAMIENTAS_LECTURA, ...HERRAMIENTAS_PROPUESTA];

/**
 * Recorre el esquema COMPLETO, incluidos los objetos anidados dentro de
 * arrays. Es donde viven los campos de las herramientas de propuesta, y donde
 * un `grupoId` se colaría sin que un chequeo del primer nivel lo vea.
 */
function todasLasClaves(esquema: EsquemaParametros): string[] {
  const claves: string[] = [];
  const visitar = (propiedades: Record<string, PropiedadEsquema>): void => {
    for (const [nombre, propiedad] of Object.entries(propiedades)) {
      claves.push(nombre);

      if (propiedad.type === 'array' && propiedad.items.type === 'object') {
        visitar(propiedad.items.properties);
      }

      if (propiedad.type === 'object') {
        visitar(propiedad.properties);
      }
    }
  };

  visitar(esquema.properties);

  return claves;
}

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

    // Las DOS familias, y hasta el fondo de los objetos anidados: las de
    // propuesta llevan arrays de objetos, y ahí es donde un `grupoId` se
    // colaría sin que un chequeo del primer nivel lo viera.
    for (const herramienta of TODAS) {
      for (const nombreParametro of todasLasClaves(herramienta.parametros)) {
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
    for (const herramienta of TODAS) {
      expect(herramienta.parametros.additionalProperties, herramienta.nombre).toBe(false);
    }
  });

  describe('las de propuesta (tanda 5)', () => {
    it('son las cuatro de la spec y todas empiezan con proponer_', () => {
      // El nombre es parte del contrato con el modelo: `proponer_` le dice que
      // no está aplicando nada. Un `crear_*` acá significaría que la decisión 6
      // se rompió.
      expect(NOMBRES_HERRAMIENTAS_PROPUESTA).toEqual([
        'proponer_crear_actividades',
        'proponer_editar_actividades',
        'proponer_precios_tienda',
        'proponer_rendimientos_monedas',
      ]);

      for (const nombre of NOMBRES_HERRAMIENTAS_PROPUESTA) {
        expect(nombre.startsWith('proponer_'), nombre).toBe(true);
      }
    });

    it('cada una le avisa al modelo que NO aplica el cambio', () => {
      // Sin esto el modelo dice «ya lo cambié», que es exactamente la frase que
      // rompe la confianza del Tutor cuando después ve que no cambió nada.
      for (const herramienta of HERRAMIENTAS_PROPUESTA) {
        expect(herramienta.descripcion, herramienta.nombre).toContain('No aplica el cambio');
      }
    });

    it('ningún nombre de herramienta se repite entre las dos familias', () => {
      const todos = [...NOMBRES_HERRAMIENTAS_LECTURA, ...NOMBRES_HERRAMIENTAS_PROPUESTA];

      expect(new Set(todos).size).toBe(todos.length);
    });
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
