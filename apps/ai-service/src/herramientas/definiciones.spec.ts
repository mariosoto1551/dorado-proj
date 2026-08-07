import { describe, expect, it } from 'vitest';

import {
  HERRAMIENTAS_PROPUESTA,
  NOMBRES_HERRAMIENTAS_PROPUESTA,
} from '../propuestas/definiciones-propuesta';
import {
  aJsonSchema,
  DefinicionHerramienta,
  EsquemaParametros,
  HERRAMIENTAS_LECTURA,
  NOMBRES_HERRAMIENTAS_LECTURA,
  PropiedadEsquema,
} from './definiciones';

/** Todas las herramientas que el modelo puede llamar, de las dos familias. */
const TODAS = [...HERRAMIENTAS_LECTURA, ...HERRAMIENTAS_PROPUESTA];

/**
 * Recorre el esquema completo devolviendo la propiedad entera y su ruta, para
 * los chequeos que miran el CONTENIDO de cada propiedad y no solo su nombre.
 */
function todasLasPropiedades(
  esquema: EsquemaParametros
): Array<{ ruta: string; propiedad: PropiedadEsquema }> {
  const encontradas: Array<{ ruta: string; propiedad: PropiedadEsquema }> = [];
  const visitar = (propiedades: Record<string, PropiedadEsquema>, prefijo: string): void => {
    for (const [nombre, propiedad] of Object.entries(propiedades)) {
      const ruta = `${prefijo}${nombre}`;

      encontradas.push({ ruta, propiedad });

      if (propiedad.type === 'array') {
        encontradas.push({ ruta: `${ruta}[]`, propiedad: propiedad.items });

        if (propiedad.items.type === 'object') {
          visitar(propiedad.items.properties, `${ruta}[].`);
        }
      }

      if (propiedad.type === 'object') {
        visitar(propiedad.properties, `${ruta}.`);
      }
    }
  };

  visitar(esquema.properties, '');

  return encontradas;
}

/** Una herramienta de propuesta por nombre; si no está, el test falla acá. */
function propuesta(nombre: string): DefinicionHerramienta {
  const encontrada = HERRAMIENTAS_PROPUESTA.find((herramienta) => herramienta.nombre === nombre);

  if (!encontrada) {
    throw new Error(`No existe la herramienta de propuesta "${nombre}".`);
  }

  return encontrada;
}

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
    it('son las de la spec y todas empiezan con proponer_', () => {
      // El nombre es parte del contrato con el modelo: `proponer_` le dice que
      // no está aplicando nada. Un `crear_*` acá significaría que la decisión 6
      // se rompió.
      expect(NOMBRES_HERRAMIENTAS_PROPUESTA).toEqual([
        'proponer_crear_actividades',
        'proponer_editar_actividades',
        // fase-14-30 tanda 4 — familia catálogo.
        'proponer_crear_conductas',
        'proponer_editar_conductas',
        'proponer_configurar_turnos',
        // fase-14-30 tanda 5 — familia economía. `proponer_precios_tienda` pasó
        // a `proponer_editar_productos` (decisión 7): renombrar la herramienta
        // es gratis porque su nombre no está persistido en ningún lado — el
        // valor `PRECIOS_TIENDA` del enum sí, y por eso ese no se tocó.
        'proponer_crear_recompensas',
        'proponer_editar_recompensas',
        'proponer_crear_productos',
        'proponer_editar_productos',
        'proponer_etiquetas',
        'proponer_rendimientos_monedas',
        // fase-14-30 tanda 6 — familia escala.
        'proponer_umbrales_zona',
        // fase-14-30 tanda 7 — familia personas.
        'proponer_roles_grupo',
        'proponer_equipos',
        // fase-14-31 tanda 4 — familia destructiva. Siguen empezando con
        // `proponer_`: que la operación sea un DELETE no cambia que la IA
        // propone y aplica un humano.
        'proponer_archivar',
        'proponer_quitar_marcas',
        // fase-14-31 tanda 5 — familia de ajustes. Es la primera herramienta
        // que escribe en un ledger, y sigue proponiendo: lo que la hace segura
        // no es el verbo del nombre sino que no tiene con qué aplicarla.
        'proponer_ajustes_manuales',
        // fase-14-31 tanda 6 — familia de anotaciones. Va separada de la de
        // quitar marcas (decisión 7): lo que agrega y lo que quita nunca
        // comparten tarjeta, para que la ceremonia del borrado siga
        // significando algo.
        'proponer_anotar',
      ]);

      for (const nombre of NOMBRES_HERRAMIENTAS_PROPUESTA) {
        expect(nombre.startsWith('proponer_'), nombre).toBe(true);
      }
    });

    /**
     * Criterio de aceptación 4 del fase-14-30, como test sobre la forma.
     *
     * La decisión 3 dice «solo altas y ediciones, ninguna operación usa
     * `DELETE`», y su corolario menos obvio es este: los endpoints de rol y de
     * equipo aceptan un `estado`, así que **poner algo en INACTIVO es archivarlo
     * por otro camino** y la regla no distingue entre el verbo y el efecto. Un
     * `estado` en un esquema de propuesta es la forma en que la decisión 3 se
     * rompería sin que aparezca la palabra DELETE en ningún lado.
     */
    it('ningún esquema de propuesta acepta un campo estado (decisión 3)', () => {
      const infractoras: string[] = [];

      for (const herramienta of HERRAMIENTAS_PROPUESTA) {
        for (const { ruta } of todasLasPropiedades(herramienta.parametros)) {
          if (/(^|\.)estado$/.test(ruta)) {
            infractoras.push(`${herramienta.nombre}.${ruta}`);
          }
        }
      }

      expect(
        infractoras,
        'La IA no archiva ni desactiva nada (fase-14-30 decisión 3), y un campo `estado` es ' +
          'archivar por otro camino. Las de LECTURA sí lo aceptan como filtro: ahí es lo ' +
          'contrario, sirve para VER lo archivado.'
      ).toEqual([]);
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

  it('están las catorce de la spec, con nombres únicos', () => {
    // Las ocho del fase-14-29, las cuatro del fase-14-30 (`listar_tienda` en la
    // tanda 1; etiquetas, turnos y configuración en la tanda 3) y las dos del
    // fase-14-31 (el estado del día y los saldos).
    expect(NOMBRES_HERRAMIENTAS_LECTURA).toEqual([
      'listar_actividades',
      'listar_conductas',
      'listar_participantes',
      'listar_umbrales_zona',
      'resumen_puntajes',
      'listar_recompensas',
      'listar_rendimientos_monedas',
      'listar_tienda',
      'listar_etiquetas',
      'listar_turnos',
      'configuracion_del_grupo',
      'resumen_cumplimiento',
      'estado_de_hoy',
      'listar_billeteras',
    ]);
    expect(new Set(NOMBRES_HERRAMIENTAS_LECTURA).size).toBe(HERRAMIENTAS_LECTURA.length);
  });

  it('la lista de nombres y las definiciones no se separan', () => {
    // `NOMBRES_HERRAMIENTAS_LECTURA` se escribe a mano (de un `.map()` no sale
    // el tipo literal que hace cumplir la decisión 1), así que hace falta algo
    // que lo mantenga pegado a las definiciones reales.
    expect(HERRAMIENTAS_LECTURA.map((herramienta) => herramienta.nombre)).toEqual([
      ...NOMBRES_HERRAMIENTAS_LECTURA,
    ]);
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

  /**
   * TEST ESTRUCTURAL 3 (fase-14-30, decisión 1). Hermano del de arriba: aquel
   * mira que no entre un dato que el modelo no debe poner, este que no se pida
   * un dato que el modelo no puede tener.
   *
   * El defecto que lo motivó: `proponer_precios_tienda` pedía un `productoId`
   * que ninguna de las ocho lecturas devolvía. Las dos piezas estaban bien
   * escritas y entre ellas no había nadie. Esto es ese «nadie».
   */
  describe('todo id que se pide se puede haber leído antes (decisión 1 del fase-14-30)', () => {
    it('cada propiedad uuid declara de qué herramienta de lectura sale', () => {
      const sinOrigen: string[] = [];

      for (const herramienta of TODAS) {
        for (const { ruta, propiedad } of todasLasPropiedades(herramienta.parametros)) {
          if (!('formato' in propiedad) || propiedad.formato !== 'uuid') {
            continue;
          }

          const origen = propiedad.origen ?? [];
          const desconocido = origen.some(
            (nombre) => !NOMBRES_HERRAMIENTAS_LECTURA.includes(nombre)
          );

          if (origen.length === 0 || desconocido) {
            sinOrigen.push(`${herramienta.nombre}.${ruta}`);
          }
        }
      }

      expect(
        sinOrigen,
        'Ninguna herramienta de propuesta puede aceptar un id que ninguna herramienta de ' +
          'lectura devuelva (fase-14-30 decisión 1). Usá `uuidDe(qué, origen)` y, si el ' +
          'origen todavía no existe, la herramienta que falta es la de LECTURA.'
      ).toEqual([]);
    });

    it('ninguna propiedad habla de un uuid sin declararlo como tal', () => {
      // El chequeo de arriba solo ve lo que pasó por `uuidDe`. Este ve el
      // camino corto: una propiedad escrita a mano que pide un id igual, con la
      // descripción como única pista. Sin esto la regla se saltea sin querer.
      const aMano: string[] = [];

      for (const herramienta of TODAS) {
        for (const { ruta, propiedad } of todasLasPropiedades(herramienta.parametros)) {
          const pareceId = /\buuid\b/i.test(propiedad.description);
          const declarado = 'formato' in propiedad && propiedad.formato === 'uuid';

          if (pareceId && !declarado) {
            aMano.push(`${herramienta.nombre}.${ruta}`);
          }
        }
      }

      expect(
        aMano,
        'Una propiedad que pide un id se declara con `uuidDe()`, que es lo que la obliga a ' +
          'nombrar su origen. Escribirla a mano saltea la decisión 1 sin que nada se ponga rojo.'
      ).toEqual([]);
    });

    /**
     * La familia personas (tanda 7) es la primera que necesita ids de PERSONA,
     * y los nombres del contrato de identity —`usuarioId`, `jefeUsuarioId`,
     * `rolGrupoId`— no pasan el test del tenant de arriba. El catálogo usa su
     * propio vocabulario y el armador traduce; lo que garantiza que el id sea
     * el correcto no es su nombre, es que **está declarado con su origen**.
     */
    it('los ids de persona se declaran con origen aunque el campo no se llame usuarioId', () => {
      const rutas = ['crear[].jefeParticipanteId', 'crear[].participantesIds[]'];

      for (const ruta of rutas) {
        const propiedad = todasLasPropiedades(propuesta('proponer_equipos').parametros).find(
          (candidata) => candidata.ruta === ruta
        );

        expect(propiedad?.propiedad, ruta).toMatchObject({
          formato: 'uuid',
          origen: ['listar_participantes'],
        });
      }
    });

    it('los ids de la tienda salen de listar_tienda, que es el defecto que cerró el ítem', () => {
      const productoId = todasLasPropiedades(
        propuesta('proponer_editar_productos').parametros
      ).find(({ ruta }) => ruta === 'ediciones[].productoId');

      expect(productoId?.propiedad).toMatchObject({ formato: 'uuid', origen: ['listar_tienda'] });
      expect(NOMBRES_HERRAMIENTAS_LECTURA).toContain('listar_tienda');
    });
  });

  describe('lo que viaja al proveedor', () => {
    it('aJsonSchema saca los metadatos, que no son JSON Schema', () => {
      const limpio = aJsonSchema(propuesta('proponer_editar_productos').parametros);
      const serializado = JSON.stringify(limpio);

      expect(serializado).not.toContain('formato');
      expect(serializado).not.toContain('origen');
      // Lo que sí tiene que sobrevivir: el esquema propiamente dicho.
      expect(serializado).toContain('productoId');
      expect(serializado).toContain('minimum');
    });

    it('limpia también los objetos anidados adentro de los arrays', () => {
      // Es donde viven TODOS los ids de este catálogo: un limpiador de primer
      // nivel dejaría pasar cada uno de ellos.
      for (const herramienta of TODAS) {
        const serializado = JSON.stringify(aJsonSchema(herramienta.parametros));

        expect(serializado, herramienta.nombre).not.toContain('"formato"');
        expect(serializado, herramienta.nombre).not.toContain('"origen"');
      }
    });

    it('no le cambia nada más al esquema', () => {
      // Un limpiador que además reordene o pierda claves rompería el catálogo
      // en silencio: el modelo dejaría de ver campos que sí existen.
      const original = HERRAMIENTAS_LECTURA[0].parametros;

      expect(aJsonSchema(original)).toEqual(original);
    });
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
