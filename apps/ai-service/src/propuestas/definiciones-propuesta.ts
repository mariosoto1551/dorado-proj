import {
  DefinicionHerramienta,
  NombreHerramientaLectura,
  PropiedadEsquema,
} from '../herramientas/definiciones';

/**
 * Las herramientas de PROPUESTA (fase-14-29 Parte D, tanda 5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA ASIMETRÍA QUE ES EL CORAZÓN DEL ÍTEM:
 *
 * El modelo «llama» a estas herramientas, pero **no ejecutan nada**. El
 * servicio valida los argumentos, arma una `Propuesta` y le contesta al modelo
 * «propuesta armada, mostrala». Nada toca ninguna base hasta que un humano
 * aprieta «Aplicar», y cuando lo aprieta, **el que escribe es el frontend con
 * el JWT del Tutor** contra los endpoints públicos que ya existen.
 *
 * Por eso los nombres empiezan con `proponer_` y no con `crear_`: el nombre es
 * parte del contrato con el modelo. Si algún día alguien agrega acá una
 * herramienta que escribe, el ítem entero perdió su defensa principal.
 *
 * Igual que las de lectura, **ninguna declara el tenant como parámetro**
 * (decisión 9), y el mismo test estructural las cubre.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Nota que se repite en cada herramienta: el modelo tiene que saber que no aplica. */
const NO_APLICA =
  'No aplica el cambio: arma una propuesta que la app le muestra al Tutor para que decida. ' +
  'Nunca digas que ya lo hiciste.';

/**
 * Un id que el modelo tiene que haber LEÍDO antes, con la lectura de la que
 * sale escrita en la firma.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DECISIÓN 1 DEL fase-14-30, en forma ejecutable:
 *
 *   **Ninguna herramienta de propuesta puede aceptar un id que ninguna
 *   herramienta de lectura devuelva.**
 *
 * Nació de un agujero real: `proponer_precios_tienda` pedía un `productoId` y
 * ninguna de las ocho lecturas del fase-14-29 devolvía uno, así que el modelo
 * solo podía inventarlo y la propuesta moría al aplicar. Cada pieza estaba bien
 * escrita; lo que faltaba era el cable, y nada lo verificaba.
 *
 * Declarar el origen hace dos cosas a la vez: `NombreHerramientaLectura` impide
 * que compile un origen que no existe, y la descripción le dice al modelo qué
 * llamar antes —o sea que la regla, además de tapar el agujero, mejora el
 * prompt—. `definiciones.spec.ts` verifica que ninguna propiedad uuid se quede
 * sin origen.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const uuidDe = (
  que: string,
  ...origen: [NombreHerramientaLectura, ...NombreHerramientaLectura[]]
): PropiedadEsquema => ({
  type: 'string',
  description: `id (uuid) de ${que}, tal como vino de ${origen.join(' o de ')}.`,
  formato: 'uuid',
  origen,
});

/**
 * Los campos de una actividad tal como los ve el modelo.
 *
 * Es un subconjunto deliberado del request real: están los que un asistente
 * puede decidir con la información que tiene, y los tres modos de destinatario
 * se ofrecen pero de a uno.
 *
 * `siempreVisible` estaba afuera en el fase-14-29 por un motivo que dejó de
 * valer: solo hace algo con el plan del día activo, y el modelo no tenía cómo
 * saber si el grupo lo tenía prendido. Lo destrabó `configuracion_del_grupo`
 * (tanda 3), y por eso entra recién ahora y no antes (decisión 8).
 */
function camposActividad(conNombre: boolean): Record<string, PropiedadEsquema> {
  return {
    ...(conNombre
      ? {
          nombre: {
            type: 'string' as const,
            description: 'Nombre corto y concreto, en infinitivo o imperativo. Máximo 120 caracteres.',
          },
        }
      : {}),
    descripcion: {
      type: 'string',
      description: 'Aclaración opcional de qué hay que hacer para que cuente como cumplida.',
    },
    tipoPuntaje: {
      type: 'string',
      description:
        'OBLIGATORIA: se espera que se haga, y no hacerla RESTA valorPuntos. ' +
        'OPCIONAL: hacerla SUMA valorPuntos y no hacerla no penaliza.',
      enum: ['OPCIONAL', 'OBLIGATORIA'],
    },
    valorPuntos: {
      type: 'integer',
      description:
        'Siempre positivo. En una OPCIONAL es lo que suma; en una OBLIGATORIA es lo que ' +
        'resta si no se hace. Calibralo contra los rangos de las zonas del grupo.',
      minimum: 1,
    },
    puntosPorCumplir: {
      type: 'integer',
      description:
        'Lo que SUMA cumplir una obligatoria que requiere confirmación (ej. +2 contra un ' +
        'castigo de −10). Solo tiene efecto con tipoPuntaje OBLIGATORIA y ' +
        'comportamientoAlCierre REQUIERE_CONFIRMACION.',
      minimum: 0,
    },
    tipoLimiteTiempo: {
      type: 'string',
      description:
        'SIN_LIMITE es lo normal. DEADLINE exige deadlineHora. CRONOMETRO exige ' +
        'duracionCronometroMinutos y sirve para cosas que se miden mientras se hacen.',
      enum: ['SIN_LIMITE', 'DEADLINE', 'CRONOMETRO'],
    },
    deadlineHora: {
      type: 'string',
      description:
        'Hora límite "HH:mm" en 24 h, hora local del grupo. OBLIGATORIA con DEADLINE. ' +
        'Con SIN_LIMITE o CRONOMETRO mandá null — nunca "" ni un relleno como "00:00".',
    },
    duracionCronometroMinutos: {
      type: 'integer',
      description:
        'Minutos del cronómetro. OBLIGATORIA con CRONOMETRO. Con SIN_LIMITE o DEADLINE ' +
        'mandá null — nunca 0 ni 1 de relleno.',
      minimum: 1,
    },
    repeticionesMaximasSesion: {
      type: 'integer',
      description: 'Cuántas veces por día se puede registrar. 1 si no se aclara otra cosa.',
      minimum: 1,
    },
    repeticionesMinimasSesion: {
      type: 'integer',
      description:
        'Cuántas confirmaciones hacen falta para no perder puntos. Nunca mayor que ' +
        'repeticionesMaximasSesion. 1 = comportamiento normal.',
      minimum: 1,
    },
    repeticionesMaximasSeccion: {
      type: 'integer',
      description:
        'Tope de veces en toda la sección. Mandá null —que es lo normal— para que se calcule ' +
        'solo: repeticionesMaximasSesion por la cantidad de días de la sección. Ponelo únicamente ' +
        'para algo que se hace pocas veces por semana y no todos los días.',
      minimum: 1,
    },
    comportamientoAlCierre: {
      type: 'string',
      description:
        'ASUME_HECHA: no hay castigo automático — es lo que va en toda OPCIONAL. ' +
        'REQUIERE_CONFIRMACION: solo en OBLIGATORIA; si no la confirman antes de cerrar el ' +
        'día, resta.',
      enum: ['ASUME_HECHA', 'REQUIERE_CONFIRMACION'],
    },
    alcance: {
      type: 'string',
      description:
        'INDIVIDUAL: cada participante la hace para sí. EQUIPO: la marca el jefe una vez y ' +
        'se reparte al equipo (exige tipoPuntaje OPCIONAL).',
      enum: ['INDIVIDUAL', 'EQUIPO'],
    },
    bonoJefePuntos: {
      type: 'integer',
      description: 'Puntos extra para el jefe del equipo. 0 fuera de alcance EQUIPO.',
      minimum: 0,
    },
    diasSemana: {
      type: 'array',
      description:
        'Días en que se puede registrar: 0=domingo … 6=sábado. Mandá la lista de los 7 (o null) ' +
        'para "todos los días".',
      items: { type: 'integer', description: '0=domingo … 6=sábado', minimum: 0, maximum: 6 },
      maxItems: 7,
    },
    siempreVisible: {
      type: 'boolean',
      description:
        'La actividad aparece sola en la lista del día del integrante, sin que él la elija. ' +
        'Solo hace algo si el grupo tiene el plan del día activo —consultalo con ' +
        'configuracion_del_grupo antes de usarlo— y solo en OPCIONAL de alcance INDIVIDUAL. ' +
        'false si no se pide otra cosa.',
    },
    rolesPermitidos: {
      type: 'array',
      description:
        'Ids de rol del grupo que pueden verla. Quien no tenga el rol NO la ve. ' +
        'Excluyente con usuariosPermitidos y equiposPermitidos: elegí un solo modo.',
      items: uuidDe('un rol del grupo', 'listar_participantes'),
    },
    usuariosPermitidos: {
      type: 'array',
      description:
        'Ids de participantes concretos. A diferencia del rol, es una lista fija: quien ' +
        'entre mañana al grupo no queda incluido. Excluyente con los otros dos modos.',
      items: uuidDe('un participante', 'listar_participantes'),
    },
    equiposPermitidos: {
      type: 'array',
      description: 'Ids de equipo. Exige alcance EQUIPO. Excluyente con los otros dos modos.',
      items: uuidDe('un equipo', 'listar_participantes'),
    },
    vigenteDesde: {
      type: 'string',
      description:
        'Fecha "YYYY-MM-DD" desde la que aparece. Fuera del rango la actividad NO se ve. ' +
        'Para una actividad permanente —que es lo normal— mandá null: no inventes una fecha ' +
        'lejana para simular "siempre".',
    },
    vigenteHasta: {
      type: 'string',
      description:
        'Fecha "YYYY-MM-DD" hasta la que aparece, inclusive. null si es permanente.',
    },
  };
}

/**
 * Los campos de una conducta (fase-14-30 tanda 4).
 *
 * **Sin `estado`** (decisión 3): archivar una conducta es un `DELETE` en su
 * endpoint, y ninguna propuesta de este ítem archiva nada. «Limpiame el
 * catálogo» el asistente lo sigue contestando en texto, con los datos de
 * `resumen_cumplimiento`, y el Tutor archiva a mano.
 */
function camposConducta(): Record<string, PropiedadEsquema> {
  return {
    nombre: {
      type: 'string',
      description:
        'El hecho puntual que se registra, corto y observable ("Gritar", "Ayudar sin que se lo ' +
        'pidan"). Máximo 120 caracteres.',
    },
    tipo: {
      type: 'string',
      description:
        'BUENA: suma valorPuntos cuando pasa. MALA: lo resta. Una conducta no es una actividad: ' +
        'no se espera que pase, se registra cuando pasa.',
      enum: ['BUENA', 'MALA'],
    },
    valorPuntos: {
      type: 'integer',
      description:
        'Siempre positivo, incluso en una MALA: el signo lo aplica el registro según el tipo. ' +
        'Calibralo contra los rangos de las zonas del grupo.',
      minimum: 1,
    },
    permiteAutoreporte: {
      type: 'boolean',
      description:
        'Deja que el propio integrante se la reporte. Solo tiene sentido con tipo MALA —en una ' +
        'BUENA el servicio la ignora—: es la que alguien admite haber hecho.',
    },
  };
}

export const HERRAMIENTAS_PROPUESTA: DefinicionHerramienta[] = [
  {
    nombre: 'proponer_crear_actividades',
    descripcion:
      `Propone crear una o varias actividades nuevas en el catálogo del grupo. ${NO_APLICA} ` +
      'Antes de usarla, mirá el catálogo actual y las zonas: proponer sin haber leído produce ' +
      'duplicados y valores que no tienen sentido contra la escala del grupo. ' +
      'IMPORTANTE: un campo que no aplica va en **null**, nunca con un valor de relleno. ' +
      'Un "00:00" o un 1 puestos "por poner" hacen que la propuesta se rechace entera.',
    parametros: {
      type: 'object',
      properties: {
        actividades: {
          type: 'array',
          description: 'Las actividades a crear. Entre 1 y 25 por propuesta.',
          items: {
            type: 'object',
            description: 'Una actividad.',
            properties: camposActividad(true),
            required: ['nombre', 'tipoPuntaje', 'valorPuntos', 'tipoLimiteTiempo'],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 25,
        },
        resumen: {
          type: 'string',
          description:
            'Una línea explicando el criterio con el que armaste el conjunto. La lee el Tutor ' +
            'arriba de la lista, antes de decidir.',
        },
      },
      required: ['actividades'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_editar_actividades',
    descripcion:
      `Propone cambios sobre actividades que YA existen. ${NO_APLICA} ` +
      'Mandá solo los campos que cambian: lo que no mandes queda como está.',
    parametros: {
      type: 'object',
      properties: {
        ediciones: {
          type: 'array',
          description: 'Los cambios, uno por actividad. Entre 1 y 25 por propuesta.',
          items: {
            type: 'object',
            description: 'Un cambio sobre una actividad existente.',
            properties: {
              actividadId: uuidDe('la actividad a editar', 'listar_actividades'),
              ...camposActividad(true),
            },
            required: ['actividadId'],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 25,
        },
        resumen: { type: 'string', description: 'Una línea explicando qué cambia y por qué.' },
      },
      required: ['ediciones'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_crear_conductas',
    descripcion:
      `Propone crear conductas nuevas en el catálogo del grupo. ${NO_APLICA} ` +
      'Una conducta es un hecho puntual que suma o resta cuando pasa, no algo que se espera ' +
      'que se haga: para eso están las actividades. Mirá antes las que ya existen y las zonas, ' +
      'que son la escala contra la que se calibra cada valor.',
    parametros: {
      type: 'object',
      properties: {
        conductas: {
          type: 'array',
          description: 'Las conductas a crear. Entre 1 y 25 por propuesta.',
          items: {
            type: 'object',
            description: 'Una conducta.',
            properties: camposConducta(),
            required: ['nombre', 'tipo', 'valorPuntos'],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 25,
        },
        resumen: {
          type: 'string',
          description:
            'Una línea explicando el criterio con el que armaste el conjunto. La lee el Tutor ' +
            'arriba de la lista, antes de decidir.',
        },
      },
      required: ['conductas'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_editar_conductas',
    descripcion:
      `Propone cambios sobre conductas que YA existen. ${NO_APLICA} ` +
      'Mandá solo los campos que cambian: lo que no mandes queda como está. ' +
      'No sirve para archivar una conducta — eso lo hace el Tutor en su pantalla.',
    parametros: {
      type: 'object',
      properties: {
        ediciones: {
          type: 'array',
          description: 'Los cambios, uno por conducta. Entre 1 y 25 por propuesta.',
          items: {
            type: 'object',
            description: 'Un cambio sobre una conducta existente.',
            properties: {
              conductaId: uuidDe('la conducta a editar', 'listar_conductas'),
              ...camposConducta(),
            },
            required: ['conductaId'],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 25,
        },
        resumen: { type: 'string', description: 'Una línea explicando qué cambia y por qué.' },
      },
      required: ['ediciones'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_configurar_turnos',
    descripcion:
      `Propone que una actividad rote entre varios participantes. ${NO_APLICA} ` +
      'Solo se puede rotar una actividad OBLIGATORIA de alcance INDIVIDUAL: la rotación es ' +
      'quién tiene que hacerla hoy. Mirá antes listar_turnos para saber cuáles ya rotan y con ' +
      'qué secuencia, porque esto REEMPLAZA la configuración anterior de esa actividad.',
    parametros: {
      type: 'object',
      properties: {
        turnos: {
          type: 'array',
          description: 'Las rotaciones a configurar, una por actividad. Entre 1 y 25.',
          items: {
            type: 'object',
            description: 'La rotación de una actividad.',
            properties: {
              actividadId: uuidDe('la actividad que va a rotar', 'listar_actividades'),
              modo: {
                type: 'string',
                description:
                  'ORDEN_FIJO: se recorre la secuencia tal como la escribiste. AZAR: se barajan ' +
                  'las posiciones al empezar cada vuelta.',
                enum: ['ORDEN_FIJO', 'AZAR'],
              },
              frecuencia: {
                type: 'string',
                description:
                  'SESION: el turno cambia todos los días. SECCION: el mismo tiene el turno ' +
                  'toda la sección (la semana).',
                enum: ['SESION', 'SECCION'],
              },
              activo: {
                type: 'boolean',
                description:
                  'false deja la rotación configurada pero apagada, y la actividad vuelve a ser ' +
                  'de todos. true si no se pide otra cosa.',
              },
              posiciones: {
                type: 'array',
                description:
                  'La secuencia, EN ORDEN. Se admiten repetidos a propósito: alguien que ' +
                  'aparece dos veces recibe el doble de turnos que el resto. Si la actividad ' +
                  'está dirigida a personas concretas, la secuencia sale de esas personas.',
                items: uuidDe('un participante', 'listar_participantes'),
                minItems: 1,
                maxItems: 50,
              },
            },
            required: ['actividadId', 'modo', 'frecuencia', 'posiciones'],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 25,
        },
        resumen: { type: 'string', description: 'Una línea con el criterio de la rotación.' },
      },
      required: ['turnos'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_precios_tienda',
    descripcion:
      `Propone cambiar el precio en monedas de productos de la tienda. ${NO_APLICA} ` +
      'Para que un precio tenga sentido hay que saber cuánto se gana por semana: mirá antes ' +
      'los rendimientos en monedas, no solo la lista de precios.',
    parametros: {
      type: 'object',
      properties: {
        precios: {
          type: 'array',
          description: 'Los precios a cambiar. Entre 1 y 50 por propuesta.',
          items: {
            type: 'object',
            description: 'El precio nuevo de un producto.',
            properties: {
              productoId: uuidDe('el producto de la tienda', 'listar_tienda'),
              precio: {
                type: 'integer',
                description: 'Precio nuevo en monedas. Siempre mayor que 0.',
                minimum: 1,
              },
            },
            required: ['productoId', 'precio'],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 50,
        },
        resumen: {
          type: 'string',
          description: 'Una línea con el criterio: contra qué ingreso semanal calibraste.',
        },
      },
      required: ['precios'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_rendimientos_monedas',
    descripcion:
      `Propone cuántas monedas paga cada acción al cumplirse. ${NO_APLICA} ` +
      'Es el lado del ingreso de la economía: subirlo hace todo más barato en la práctica, ' +
      'aunque los precios no cambien.',
    parametros: {
      type: 'object',
      properties: {
        rendimientos: {
          type: 'array',
          description: 'Cuánto paga cada acción. Entre 1 y 50 por propuesta.',
          items: {
            type: 'object',
            description: 'Lo que paga una acción.',
            properties: {
              tipoAccion: {
                type: 'string',
                description:
                  'ACTIVIDAD si origenId es una actividad; CONDUCTA si es una conducta buena. ' +
                  'Las conductas malas no pueden pagar.',
                enum: ['ACTIVIDAD', 'CONDUCTA'],
              },
              origenId: uuidDe(
                'la actividad o conducta que paga',
                'listar_actividades',
                'listar_conductas'
              ),
              monedas: {
                type: 'integer',
                description: 'Monedas por cada vez que se cumple. 0 = no paga. Nunca negativo.',
                minimum: 0,
              },
              monedasBonoJefe: {
                type: 'integer',
                description: 'Monedas extra para el jefe. Solo en actividades de alcance EQUIPO.',
                minimum: 0,
              },
            },
            required: ['tipoAccion', 'origenId', 'monedas'],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 50,
        },
        resumen: { type: 'string', description: 'Una línea con el criterio de calibración.' },
      },
      required: ['rendimientos'],
      additionalProperties: false,
    },
  },
];

export const NOMBRES_HERRAMIENTAS_PROPUESTA: readonly string[] = HERRAMIENTAS_PROPUESTA.map(
  (herramienta) => herramienta.nombre
);
