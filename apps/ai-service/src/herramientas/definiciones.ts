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
 * JSON Schema mínimo, recursivo. Las de lectura usan solo escalares; las de
 * propuesta (tanda 5) necesitan arrays de objetos — una propuesta es una lista
 * de operaciones, no un campo suelto.
 */
export type PropiedadEsquema =
  | {
      type: 'string' | 'integer' | 'boolean' | 'number';
      description: string;
      enum?: string[];
      minimum?: number;
      maximum?: number;
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

/** Nombres válidos, para que el ejecutor rechace cualquier otro sin ramificar. */
export const NOMBRES_HERRAMIENTAS_LECTURA: readonly string[] = HERRAMIENTAS_LECTURA.map(
  (herramienta) => herramienta.nombre
);
