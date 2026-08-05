/**
 * Definiciones de las herramientas de LECTURA que el modelo puede llamar
 * (fase-14-29 Parte D, tanda 3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA QUE GOBIERNA ESTE ARCHIVO (decisión 9):
 *
 *   **El tenant nunca es un argumento de una herramienta.**
 *
 * Ninguna definición declara `organizacionId`, `grupoId` ni nada parecido. El
 * servicio los inyecta desde el JWT validado al ejecutar la llamada. El modelo
 * no puede pedir datos de otro grupo porque **no existe un lugar donde
 * escribirlos** — es la regla 3 de CLAUDE.md llevada a su forma más estricta, y
 * es la defensa contra el prompt injection que no depende de que el modelo se
 * porte bien.
 *
 * `definiciones.spec.ts` lo verifica sobre estas estructuras. Si un día una
 * herramienta parece necesitar el grupo como parámetro, la respuesta no es
 * agregarlo: es que esa herramienta pertenece a otra conversación.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * El formato es JSON Schema porque es lo que consume el `tools` de la API del
 * proveedor (tanda 4). Se declara acá, en tipos propios, y no con los tipos del
 * SDK: la tanda 4 traduce estas estructuras a lo que el SDK pida, y así un
 * cambio de proveedor no toca el catálogo de capacidades.
 */

/**
 * Los nombres de las herramientas de LECTURA, como tupla literal.
 *
 * Se escriben acá y no se derivan de `HERRAMIENTAS_LECTURA` porque de un
 * `.map()` no sale un tipo con los nombres adentro, y ese tipo es lo que hace
 * cumplir la decisión 1 del fase-14-30: **una propiedad uuid de una herramienta
 * de propuesta tiene que declarar de qué lectura sale ese id, y un origen
 * inventado no compila.**
 *
 * `definiciones.spec.ts` verifica que esta lista y las definiciones de abajo no
 * se separen.
 */
const NOMBRES = [
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
] as const;

export type NombreHerramientaLectura = (typeof NOMBRES)[number];

/**
 * JSON Schema mínimo, recursivo. Las de lectura usan solo escalares; las de
 * propuesta (tanda 5) necesitan arrays de objetos — una propuesta es una lista
 * de operaciones, no un campo suelto.
 *
 * `formato` y `origen` son **metadatos nuestros, no JSON Schema**: los lee el
 * test estructural de la decisión 1 y `aJsonSchema()` los saca antes de que
 * esto viaje al proveedor.
 */
export type PropiedadEsquema =
  | {
      type: 'string' | 'integer' | 'boolean' | 'number';
      description: string;
      enum?: string[];
      minimum?: number;
      maximum?: number;
      /** META: la propiedad es un id. Lo pone `uuidDe()`, nunca a mano. */
      formato?: 'uuid';
      /**
       * META: de qué herramienta(s) de lectura sale ese id (decisión 1). Son
       * varias cuando el id puede ser de dos entidades distintas — el `origenId`
       * de un rendimiento, que es una actividad o una conducta.
       */
      origen?: readonly NombreHerramientaLectura[];
    }
  | {
      type: 'array';
      description: string;
      items: PropiedadEsquema;
      minItems?: number;
      maxItems?: number;
    }
  | ({ description: string } & EsquemaParametros);

export interface EsquemaParametros {
  type: 'object';
  properties: Record<string, PropiedadEsquema>;
  /**
   * Vacío en todas las de LECTURA: el contexto lo pone el servicio, no el
   * modelo (decisión 9). Las de propuesta sí exigen su lista de operaciones —
   * ahí lo obligatorio es el contenido de la propuesta, nunca el tenant.
   */
  required: string[];
  additionalProperties: false;
}

export interface DefinicionHerramienta {
  nombre: string;
  /** Se la lee el modelo: dice qué contesta y, cuando importa, qué NO contesta. */
  descripcion: string;
  parametros: EsquemaParametros;
}

/** Azúcar para las varias herramientas que no reciben nada. */
function sinParametros(): EsquemaParametros {
  return { type: 'object', properties: {}, required: [], additionalProperties: false };
}

const ESTADO_CATALOGO: PropiedadEsquema = {
  type: 'string',
  description:
    'Filtra por estado. Si se omite, se devuelven las activas y las archivadas juntas.',
  enum: ['ACTIVA', 'ARCHIVADA'],
};

export const HERRAMIENTAS_LECTURA: DefinicionHerramienta[] = [
  {
    nombre: 'listar_actividades',
    descripcion:
      'Devuelve el catálogo completo de actividades del grupo con todos sus campos de ' +
      'configuración (tipo de puntaje, valor, puntos por cumplir, límite de tiempo, deadline, ' +
      'repeticiones mínimas y máximas, comportamiento al cierre, alcance, días de la semana, ' +
      'roles y personas permitidas, vigencia). Usala antes de proponer crear o editar ' +
      'actividades: sin ver lo que ya existe se proponen duplicados.',
    parametros: {
      type: 'object',
      properties: { estado: ESTADO_CATALOGO },
      required: [],
      additionalProperties: false,
    },
  },
  {
    nombre: 'listar_conductas',
    descripcion:
      'Devuelve el catálogo de conductas del grupo (buenas y malas) con su valor en puntos. ' +
      'Las conductas son hechos puntuales que suman o restan, distintas de las actividades.',
    parametros: {
      type: 'object',
      properties: { estado: ESTADO_CATALOGO },
      required: [],
      additionalProperties: false,
    },
  },
  {
    nombre: 'listar_participantes',
    descripcion:
      'Devuelve los participantes del grupo con su nombre de pila, el rol funcional que tienen ' +
      'asignado (si el grupo usa roles) y los equipos de trabajo con sus miembros y su jefe. ' +
      'No incluye datos de contacto de ninguna clase. Usala para proponer actividades dirigidas ' +
      'a personas, roles o equipos concretos.',
    parametros: sinParametros(),
  },
  {
    nombre: 'listar_umbrales_zona',
    descripcion:
      'Devuelve las zonas del grupo (nombre, rango de puntos y color), de la más baja a la más ' +
      'alta. Son la escala del sistema: un valor en puntos solo significa algo comparado contra ' +
      'estos rangos. Consultala antes de proponer cualquier valor en puntos.',
    parametros: sinParametros(),
  },
  {
    nombre: 'resumen_puntajes',
    descripcion:
      'Devuelve cómo viene cada participante en la sección más reciente: puntaje, zona alcanzada ' +
      'y si está descalificado. Indica si los números son definitivos (la sección ya se evaluó) ' +
      'o provisorios (la sección sigue abierta). Usala para explicar por qué alguien está en la ' +
      'zona en la que está.',
    parametros: sinParametros(),
  },
  {
    nombre: 'listar_recompensas',
    descripcion:
      'Devuelve el catálogo de recompensas y castigos del grupo, con la zona a la que está ' +
      'atada cada una, sus etiquetas y si se obtiene a elección o al azar. Es el lado del gasto ' +
      'de la economía.',
    parametros: {
      type: 'object',
      properties: { estado: ESTADO_CATALOGO },
      required: [],
      additionalProperties: false,
    },
  },
  {
    nombre: 'listar_rendimientos_monedas',
    descripcion:
      'Devuelve cuántas monedas paga cada actividad o conducta buena al cumplirse, y el bono ' +
      'extra del jefe de equipo cuando corresponde. Es el lado del ingreso de la economía: hay ' +
      'que mirarlo junto con las recompensas para saber si un precio es alcanzable.',
    parametros: sinParametros(),
  },
  {
    nombre: 'listar_tienda',
    descripcion:
      'Devuelve los productos de la tienda con su precio en monedas, de dónde sale lo que ' +
      'entregan (un ítem suelto o una bolsa) y si se obtiene al azar o a elección, más las ' +
      'bolsas con los ítems que contienen. **Es la única forma de conseguir el id de un ' +
      'producto**: para proponer un precio hay que llamarla antes. Ojo que la tienda solo ' +
      'funciona si el grupo está en modo TIENDA.',
    parametros: {
      type: 'object',
      properties: { estado: ESTADO_CATALOGO },
      required: [],
      additionalProperties: false,
    },
  },
  {
    nombre: 'listar_etiquetas',
    descripcion:
      'Devuelve las etiquetas con las que el Tutor organiza su catálogo de recompensas y ' +
      'castigos (nombre y color). No tienen ningún efecto sobre el juego: sirven para agrupar ' +
      'y para armar bolsas o publicar productos en masa. Llamala antes de proponer asignar ' +
      'etiquetas: sin sus ids no se puede asignar ninguna.',
    parametros: {
      type: 'object',
      properties: { estado: ESTADO_CATALOGO },
      required: [],
      additionalProperties: false,
    },
  },
  {
    nombre: 'listar_turnos',
    descripcion:
      'Devuelve las actividades que rotan entre participantes, con su modo (orden fijo o al ' +
      'azar), cada cuánto rota (por día o por sección), si está activa y la secuencia de ' +
      'posiciones en orden. Una persona puede aparecer varias veces en la secuencia: así se ' +
      'le da más turnos que a otra. Las actividades que no rotan no aparecen.',
    parametros: sinParametros(),
  },
  {
    nombre: 'configuracion_del_grupo',
    descripcion:
      'Devuelve la configuración que cambia qué significan otros campos: si el plan del día ' +
      'está activo, qué pueden crear los integrantes, con cuántos puntos arranca cada uno en ' +
      'cada sección, y si las recompensas se dan directo por zona o se compran en una tienda ' +
      'con monedas. **Consultala antes de proponer precios** (en modo DIRECTO no hay tienda) ' +
      'y antes de usar el campo siempreVisible (solo hace algo con el plan del día activo).',
    parametros: sinParametros(),
  },
  {
    nombre: 'resumen_cumplimiento',
    descripcion:
      'Devuelve, por cada actividad del catálogo, cuántas veces se completó, cuántas se marcó ' +
      'como no hecha, cuántas personas distintas la hicieron y cuándo fue la última vez. ' +
      'Contesta preguntas como "qué actividad no hace nadie nunca", que mirando el catálogo no ' +
      'se puede contestar porque ahí todas se ven igual.',
    parametros: {
      type: 'object',
      properties: {
        dias: {
          type: 'integer',
          description: 'Ventana hacia atrás en días. Por defecto 30.',
          minimum: 1,
          maximum: 365,
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

/**
 * Nombres válidos, para que el ejecutor rechace cualquier otro sin ramificar.
 *
 * Se tipa `readonly string[]` y no como la tupla: quien pregunta acá compara
 * contra un nombre que mandó el modelo, o sea un `string` cualquiera. El tipo
 * literal se exporta aparte (`NombreHerramientaLectura`) para lo único donde
 * hace falta, que es declarar el origen de un id.
 */
export const NOMBRES_HERRAMIENTAS_LECTURA: readonly string[] = NOMBRES;

/**
 * Saca los metadatos que no son JSON Schema (`formato`, `origen`) antes de
 * mandar el catálogo al proveedor.
 *
 * Podría no hacerse —hoy el proveedor ignora las claves que no conoce— y por
 * eso mismo se hace: que el catálogo funcione depende de un detalle de la
 * implementación de un tercero, y acá lo que viaja hacia afuera se decide de
 * este lado. Además mantiene la promesa de la Parte E: lo que sale es
 * exactamente lo que se puede leer en esta función.
 */
export function aJsonSchema<T extends EsquemaParametros | PropiedadEsquema>(esquema: T): T {
  const copia: Record<string, unknown> = { ...esquema };

  delete copia['formato'];
  delete copia['origen'];

  if (copia['properties']) {
    copia['properties'] = Object.fromEntries(
      Object.entries(copia['properties'] as Record<string, PropiedadEsquema>).map(
        ([nombre, propiedad]) => [nombre, aJsonSchema(propiedad)]
      )
    );
  }

  if (copia['items']) {
    copia['items'] = aJsonSchema(copia['items'] as PropiedadEsquema);
  }

  return copia as T;
}
