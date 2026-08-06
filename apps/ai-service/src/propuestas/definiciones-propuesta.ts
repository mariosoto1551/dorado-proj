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
 * Un participante del grupo. Se llama `participante` y no `usuario` **a
 * propósito**, y la razón merece las líneas que ocupa (fase-14-30 tanda 7).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El test estructural de la decisión 9 del fase-14-29 prohíbe que una propiedad
 * de una herramienta se llame como el tenant, y su regex incluye `usuarioId` y
 * `grupo` — o sea que `usuarioId`, `jefeUsuarioId` y hasta `rolGrupoId`, que son
 * los nombres de los campos en los contratos de identity, **no compilan ese
 * test**. La familia personas es la primera que los necesita.
 *
 * Hay dos salidas y esta es la elegida: el catálogo usa su propio vocabulario
 * (`participanteId`, `rolId`, `equipoId`) y **el armador traduce a los nombres
 * del contrato**, igual que la tanda 4 con `posiciones`. La otra era aflojar la
 * regex, y no vale la pena: es una defensa que no depende de que el modelo se
 * porte bien, el costo de mantenerla es una línea de mapeo, y el nombre que ve
 * el modelo ya venía siendo una decisión propia (decisión 9 del fase-14-30:
 * cada campo se nombra pensando en que lo lea un modelo).
 *
 * Lo que garantiza que el id sea el correcto **no es su nombre**: es que se
 * declara con `uuidDe` —así tiene origen (decisión 1)— y que el armador lo
 * valida contra los participantes reales del grupo antes de guardar nada
 * (decisión 2).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const participante = (que: string): PropiedadEsquema =>
  uuidDe(`${que} (el usuarioId que devuelve la lectura)`, 'listar_participantes');

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

/**
 * Los campos de una recompensa o castigo (fase-14-30 tanda 5).
 *
 * **`imagenUrl` no se expone**: el modelo no tiene de dónde sacar una URL
 * válida, así que la inventaría — y una imagen rota en la pantalla del
 * participante es peor que ninguna. El esquema Zod sí lo declara, para que
 * renombrarlo en rewards rompa el build (ver la nota de `esquemas.ts`).
 */
function camposRecompensa(): Record<string, PropiedadEsquema> {
  return {
    tipo: {
      type: 'string',
      description:
        'PREMIO: algo que se gana o se compra. CASTIGO: algo que se aplica y NUNCA se vende ' +
        'en la tienda ni entra en una bolsa.',
      enum: ['PREMIO', 'CASTIGO'],
    },
    nombre: {
      type: 'string',
      description: 'Qué es, concreto y en pocas palabras. Máximo 120 caracteres.',
    },
    descripcion: {
      type: 'string',
      description: 'Aclaración opcional: qué incluye, qué límites tiene.',
    },
    umbralZonaId: uuidDe('la zona a la que queda atada', 'listar_umbrales_zona'),
    permiteSeleccion: {
      type: 'boolean',
      description:
        'El participante la elige de la lista de su zona. Solo hace algo en modo DIRECTO ' +
        '(consultalo con configuracion_del_grupo); en modo TIENDA se ignora.',
    },
    permiteAzar: {
      type: 'boolean',
      description:
        'Puede salir sorteada entre las de su zona. Solo en modo DIRECTO, igual que la anterior.',
    },
  };
}

/** Los campos de un producto de la tienda (fase-14-30 tanda 5). */
function camposProducto(): Record<string, PropiedadEsquema> {
  return {
    nombre: {
      type: 'string',
      description: 'Cómo se ve en la vitrina. Máximo 120 caracteres.',
    },
    descripcion: {
      type: 'string',
      description: 'Aclaración opcional de qué se lleva el que lo compra.',
    },
    precio: {
      type: 'integer',
      description:
        'En monedas, siempre mayor que 0. Calibralo contra lo que se gana por semana: mirá ' +
        'listar_rendimientos_monedas antes, no solo la lista de precios.',
      minimum: 1,
    },
    fuente: {
      type: 'string',
      description:
        'ITEM: entrega un premio concreto, y va con recompensaId. BOLSA: entrega algo de una ' +
        'bolsa, y va con bolsaId. Nunca los dos ids juntos.',
      enum: ['ITEM', 'BOLSA'],
    },
    mecanica: {
      type: 'string',
      description:
        'Cómo se resuelve lo que sale de la bolsa: AZAR lo sortea, ELECCION lo deja elegir. ' +
        'Con fuente ITEM no significa nada y se ignora.',
      enum: ['AZAR', 'ELECCION'],
    },
    recompensaId: uuidDe('el premio que entrega (fuente ITEM)', 'listar_recompensas'),
    bolsaId: uuidDe('la bolsa que entrega (fuente BOLSA)', 'listar_tienda'),
  };
}

/**
 * Los campos de una zona de la escala (fase-14-30 tanda 6).
 *
 * **Se piden los cinco siempre**, también al editar, y no es un descuido de la
 * regla «mandá solo lo que cambia» que llevan las otras ediciones: `puntosMax:
 * null` significa *sin techo*, y el modelo no puede omitir una propiedad
 * declarada. O sea que un null de «no lo toqué» y uno de «sacale el techo»
 * llegan idénticos. Pidiendo la zona entera esa ambigüedad no existe.
 */
function camposZona(): Record<string, PropiedadEsquema> {
  return {
    nombreZona: {
      type: 'string',
      description: 'Cómo se llama ("Rojo", "Dorado"). Máximo 50 caracteres.',
    },
    orden: {
      type: 'integer',
      description: '1 es la más baja. Van corridos, sin huecos ni repetidos.',
      minimum: 1,
    },
    puntosMin: {
      type: 'integer',
      description:
        'Desde qué puntaje se entra. Puede ser negativo. Tiene que ser el puntosMax de la zona ' +
        'anterior más 1.',
    },
    puntosMax: {
      type: 'integer',
      description:
        'Hasta qué puntaje llega, inclusive. **null = sin techo, y eso solo puede serlo la zona ' +
        'más alta**, que tiene que existir. Mandá siempre este campo: número o null.',
    },
    colorHex: {
      type: 'string',
      description: 'Color "#RRGGBB" (ej. "#22C55E"). Es el que ve el participante.',
    },
  };
}

/**
 * La nota que llevan las dos herramientas destructivas (fase-14-31 decisión 2).
 *
 * El modelo tiene que saber **que casi todo es soft** para poder decírselo al
 * Tutor en la conversación, no solo en la tarjeta: el que pregunta «¿si archivo
 * esa actividad pierdo los puntos que dio?» lo pregunta en el chat.
 */
const ARCHIVAR_ES_SOFT =
  'Archivar saca el ítem de la lista y NO borra nada de lo ya pasado: el historial queda y los ' +
  'puntos que dio siguen contando. Se puede desarchivar desde la pantalla del Tutor.';

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
    nombre: 'proponer_crear_recompensas',
    descripcion:
      `Propone premios y castigos nuevos para el catálogo del grupo. ${NO_APLICA} ` +
      'Un premio se gana (o se compra, si el grupo usa tienda) y un castigo se aplica. ' +
      'Consultá antes configuracion_del_grupo: en modo DIRECTO cada uno va atado a una zona y ' +
      'umbralZonaId es obligatorio; en modo TIENDA la zona no se usa.',
    parametros: {
      type: 'object',
      properties: {
        recompensas: {
          type: 'array',
          description: 'Los premios y castigos a crear. Entre 1 y 25 por propuesta.',
          items: {
            type: 'object',
            description: 'Un premio o un castigo.',
            properties: camposRecompensa(),
            required: ['tipo', 'nombre'],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 25,
        },
        resumen: {
          type: 'string',
          description: 'Una línea explicando el criterio con el que armaste el conjunto.',
        },
      },
      required: ['recompensas'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_editar_recompensas',
    descripcion:
      `Propone cambios sobre premios y castigos que YA existen. ${NO_APLICA} ` +
      'Mandá solo los campos que cambian: lo que no mandes queda como está.',
    parametros: {
      type: 'object',
      properties: {
        ediciones: {
          type: 'array',
          description: 'Los cambios, uno por ítem. Entre 1 y 25 por propuesta.',
          items: {
            type: 'object',
            description: 'Un cambio sobre un premio o castigo existente.',
            properties: {
              recompensaId: uuidDe('el premio o castigo a editar', 'listar_recompensas'),
              ...camposRecompensa(),
            },
            required: ['recompensaId'],
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
    nombre: 'proponer_crear_productos',
    descripcion:
      `Propone productos nuevos para la tienda, y las bolsas que algunos entregan. ${NO_APLICA} ` +
      'La tienda solo existe en modo TIENDA: consultalo con configuracion_del_grupo antes, ' +
      'porque en modo DIRECTO estarías proponiendo sobre una vitrina que nadie ve. ' +
      'IMPORTANTE: una bolsa que proponés acá TODAVÍA NO EXISTE, así que no la podés usar en un ' +
      'producto de esta misma propuesta — proponé primero las bolsas y en un segundo paso los ' +
      'productos que las venden.',
    parametros: {
      type: 'object',
      properties: {
        bolsas: {
          type: 'array',
          description:
            'Bolsas a crear: conjuntos de premios de los que después sale uno. Solo premios, ' +
            'nunca castigos. Podés mandar la lista vacía si no hace falta ninguna.',
          items: {
            type: 'object',
            description: 'Una bolsa de premios.',
            properties: {
              nombre: { type: 'string', description: 'Cómo se llama la bolsa. Máximo 120.' },
              recompensaIds: {
                type: 'array',
                description: 'Los premios que contiene. Al menos uno: una bolsa vacía no sirve.',
                items: uuidDe('un premio de la bolsa', 'listar_recompensas'),
                minItems: 1,
                maxItems: 50,
              },
            },
            required: ['nombre', 'recompensaIds'],
            additionalProperties: false,
          },
          maxItems: 25,
        },
        productos: {
          type: 'array',
          description: 'Los productos a publicar en la vitrina. Podés mandar la lista vacía.',
          items: {
            type: 'object',
            description: 'Un producto de la tienda.',
            properties: camposProducto(),
            required: ['nombre', 'precio', 'fuente'],
            additionalProperties: false,
          },
          maxItems: 50,
        },
        resumen: {
          type: 'string',
          description: 'Una línea con el criterio: contra qué ingreso semanal calibraste.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_editar_productos',
    descripcion:
      `Propone cambios sobre productos que YA están en la tienda: el precio, el nombre, o qué ` +
      `entregan. ${NO_APLICA} ` +
      'Para que un precio tenga sentido hay que saber cuánto se gana por semana: mirá antes ' +
      'los rendimientos en monedas, no solo la lista de precios. ' +
      'Mandá solo los campos que cambian.',
    parametros: {
      type: 'object',
      properties: {
        ediciones: {
          type: 'array',
          description: 'Los cambios, uno por producto. Entre 1 y 50 por propuesta.',
          items: {
            type: 'object',
            description: 'Un cambio sobre un producto existente.',
            properties: {
              productoId: uuidDe('el producto de la tienda', 'listar_tienda'),
              ...camposProducto(),
            },
            required: ['productoId'],
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
      required: ['ediciones'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_etiquetas',
    descripcion:
      `Propone etiquetas nuevas para organizar el catálogo, y a qué premios o castigos ` +
      `ponérselas. ${NO_APLICA} ` +
      'Las etiquetas no cambian nada del juego: sirven para agrupar y para publicar productos ' +
      'en masa. IMPORTANTE: una etiqueta que proponés acá TODAVÍA NO EXISTE, así que no la ' +
      'podés asignar en esta misma propuesta — primero se crean, después se asignan.',
    parametros: {
      type: 'object',
      properties: {
        crear: {
          type: 'array',
          description: 'Etiquetas nuevas. Podés mandar la lista vacía si solo querés asignar.',
          items: {
            type: 'object',
            description: 'Una etiqueta del catálogo.',
            properties: {
              nombre: { type: 'string', description: 'Nombre corto. Máximo 40 caracteres.' },
              colorHex: {
                type: 'string',
                description: 'Color en formato "#RRGGBB", por ejemplo "#22C55E".',
              },
            },
            required: ['nombre', 'colorHex'],
            additionalProperties: false,
          },
          maxItems: 25,
        },
        asignar: {
          type: 'array',
          description:
            'A qué ítem le va qué etiqueta. REEMPLAZA las que tenga: mandá la lista completa, ' +
            'no solo las que agregás. Podés mandar la lista vacía.',
          items: {
            type: 'object',
            description: 'Las etiquetas que quedan puestas en un ítem.',
            properties: {
              recompensaId: uuidDe('el premio o castigo a etiquetar', 'listar_recompensas'),
              etiquetaIds: {
                type: 'array',
                description: 'Las etiquetas que le quedan. Máximo 5. Vacío las saca todas.',
                items: uuidDe('una etiqueta del catálogo', 'listar_etiquetas'),
                maxItems: 5,
              },
            },
            required: ['recompensaId', 'etiquetaIds'],
            additionalProperties: false,
          },
          maxItems: 50,
        },
        resumen: { type: 'string', description: 'Una línea con el criterio de la organización.' },
      },
      required: [],
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
  {
    nombre: 'proponer_umbrales_zona',
    descripcion:
      `Propone la escala de zonas del grupo y con cuántos puntos arranca cada uno en cada ` +
      `sección. ${NO_APLICA} ` +
      'CAMBIA EL PASADO: el puntaje se calcula al leerlo, así que mover un rango recalcula la ' +
      'zona de todos en el acto, también en las secciones ya cerradas. Decíselo al Tutor. ' +
      'Mirá antes listar_umbrales_zona y resumen_puntajes: sin eso movés gente de zona a ciegas. ' +
      'La escala es un conjunto: las zonas que quedan tienen que cubrir la recta sin huecos ni ' +
      'solapes, con los órdenes corridos desde 1 y exactamente una sin techo, la más alta. Si ' +
      'corrés un límite, mandá también la zona vecina que queda descolgada.',
    parametros: {
      type: 'object',
      properties: {
        crear: {
          type: 'array',
          description: 'Zonas nuevas. Podés mandar la lista vacía.',
          items: {
            type: 'object',
            description: 'Una zona nueva.',
            properties: camposZona(),
            required: ['nombreZona', 'orden', 'puntosMin', 'puntosMax', 'colorHex'],
            additionalProperties: false,
          },
          maxItems: 25,
        },
        editar: {
          type: 'array',
          description:
            'Zonas que ya existen, con TODOS sus campos aunque cambie uno solo. Lista vacía si ' +
            'no editás ninguna.',
          items: {
            type: 'object',
            description: 'Una zona existente, entera.',
            properties: {
              umbralZonaId: uuidDe('la zona a cambiar', 'listar_umbrales_zona'),
              ...camposZona(),
            },
            required: [
              'umbralZonaId',
              'nombreZona',
              'orden',
              'puntosMin',
              'puntosMax',
              'colorHex',
            ],
            additionalProperties: false,
          },
          maxItems: 25,
        },
        puntosIniciales: {
          type: 'integer',
          description:
            'Con cuántos puntos arranca cada uno en CADA sección. Mueve a todos por igual sobre ' +
            'la escala. Mandalo solo si lo estás cambiando.',
          minimum: 0,
        },
        resumen: {
          type: 'string',
          description: 'Una línea con la escala que proponés y por qué.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_roles_grupo',
    descripcion:
      `Propone los roles del grupo —las etiquetas funcionales tipo "cocina" o "mascotas"— y a ` +
      `quién le toca cada uno. ${NO_APLICA} ` +
      'Un rol sirve para dos cosas: se ve como chip junto al nombre y permite dirigir una ' +
      'actividad a "los de cocina" sin nombrar a nadie. Cada participante tiene un rol o ' +
      'ninguno, nunca dos. ' +
      'Mirá antes listar_participantes: trae los roles que ya existen y quién tiene cada uno. ' +
      'IMPORTANTE: un rol que proponés acá TODAVÍA NO EXISTE, así que no lo podés asignar en ' +
      'esta misma propuesta — primero se crean, después se asignan. ' +
      'No sirve para archivar un rol ni para sacar a nadie del grupo.',
    parametros: {
      type: 'object',
      properties: {
        crear: {
          type: 'array',
          description: 'Roles nuevos del catálogo. Podés mandar la lista vacía.',
          items: {
            type: 'object',
            description: 'Un rol del grupo.',
            properties: {
              nombre: {
                type: 'string',
                description: 'Corto y en minúscula ("cocina", "mascotas"). Máximo 40 caracteres.',
              },
              colorHex: {
                type: 'string',
                description: 'Color "#RRGGBB" del chip (ej. "#22C55E").',
              },
            },
            required: ['nombre', 'colorHex'],
            additionalProperties: false,
          },
          maxItems: 25,
        },
        editar: {
          type: 'array',
          description: 'Cambios de nombre o color sobre roles que ya existen. Lista vacía si no.',
          items: {
            type: 'object',
            description: 'Un cambio sobre un rol existente.',
            properties: {
              rolId: uuidDe('el rol a cambiar', 'listar_participantes'),
              nombre: { type: 'string', description: 'El nombre nuevo. Máximo 40 caracteres.' },
              colorHex: { type: 'string', description: 'El color nuevo, "#RRGGBB".' },
            },
            required: ['rolId'],
            additionalProperties: false,
          },
          maxItems: 25,
        },
        asignar: {
          type: 'array',
          description:
            'Qué rol le queda a cada participante. REEMPLAZA el que tuviera: cada uno tiene ' +
            'uno solo. Lista vacía si no asignás ninguno.',
          items: {
            type: 'object',
            description: 'El rol que le queda a un participante.',
            properties: {
              participanteId: participante('el participante'),
              rolId: uuidDe(
                'el rol que le queda; **null lo deja sin rol** (el rol sigue en el catálogo)',
                'listar_participantes'
              ),
            },
            required: ['participanteId', 'rolId'],
            additionalProperties: false,
          },
          maxItems: 50,
        },
        resumen: { type: 'string', description: 'Una línea con el criterio de la organización.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_equipos',
    descripcion:
      `Propone los equipos de trabajo del grupo: quiénes lo forman y quién es el jefe. ` +
      `${NO_APLICA} ` +
      'Un equipo hace actividades de alcance EQUIPO: las marca el jefe una vez y el puntaje se ' +
      'reparte. **Cada participante puede estar en UN SOLO equipo del grupo**, así que no ' +
      'repitas a nadie entre dos equipos ni sumes a alguien que ya está en otro. ' +
      'El jefe tiene que ser miembro del equipo. ' +
      'Mirá antes listar_participantes: trae los equipos que hay, sus miembros y sus jefes. ' +
      'No sirve para sacar a nadie de un equipo ni para archivar equipos: eso lo hace el Tutor.',
    parametros: {
      type: 'object',
      properties: {
        crear: {
          type: 'array',
          description: 'Equipos nuevos. Podés mandar la lista vacía.',
          items: {
            type: 'object',
            description: 'Un equipo nuevo, con su jefe y sus integrantes.',
            properties: {
              nombre: { type: 'string', description: 'Cómo se llama el equipo. Máximo 120.' },
              jefeParticipanteId: participante('quien va a ser el jefe'),
              participantesIds: {
                type: 'array',
                description:
                  'Los demás integrantes. El jefe ya está incluido: no hace falta repetirlo.',
                items: participante('un integrante'),
                maxItems: 50,
              },
            },
            required: ['nombre', 'jefeParticipanteId', 'participantesIds'],
            additionalProperties: false,
          },
          maxItems: 25,
        },
        editar: {
          type: 'array',
          description:
            'Cambios sobre equipos que ya existen: el nombre, gente que se suma, quién manda. ' +
            'Lista vacía si no editás ninguno.',
          items: {
            type: 'object',
            description: 'Un cambio sobre un equipo existente.',
            properties: {
              equipoId: uuidDe('el equipo a cambiar', 'listar_participantes'),
              nombre: { type: 'string', description: 'El nombre nuevo del equipo.' },
              sumarParticipantesIds: {
                type: 'array',
                description:
                  'Quiénes se suman. Tienen que estar sin equipo: nadie puede estar en dos.',
                items: participante('quien se suma'),
                maxItems: 50,
              },
              nuevoJefeParticipanteId: participante(
                'quien pasa a ser jefe; tiene que ser miembro del equipo (o sumarse en este mismo cambio)'
              ),
            },
            required: ['equipoId'],
            additionalProperties: false,
          },
          maxItems: 25,
        },
        resumen: { type: 'string', description: 'Una línea con el criterio del armado.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_archivar',
    descripcion:
      `Propone sacar del catálogo lo que ya no se usa: actividades, conductas, premios y ` +
      `castigos, productos de la tienda, bolsas, etiquetas, y la rotación de una actividad. ` +
      `${NO_APLICA} ` +
      `${ARCHIVAR_ES_SOFT} ` +
      'Es la contracara de crear: usá resumen_cumplimiento para saber QUÉ no usa nadie antes de ' +
      'proponer nada. No sirve para sacar a una persona del grupo ni de un equipo — eso lo hace ' +
      'el Tutor, y no hay herramienta que lo proponga. ' +
      'Para borrar una ZONA de la escala está proponer_umbrales_zona: sacar una del medio casi ' +
      'siempre exige ensanchar a la vecina en el mismo movimiento.',
    parametros: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Lo que se archiva. Entre 1 y 25 por propuesta.',
          items: {
            type: 'object',
            description: 'Un ítem del catálogo a archivar.',
            properties: {
              tipo: {
                type: 'string',
                description:
                  'Qué clase de ítem es el id. TURNO no archiva la actividad: le saca la ' +
                  'rotación y la actividad vuelve a ser de todos.',
                enum: [
                  'ACTIVIDAD',
                  'CONDUCTA',
                  'RECOMPENSA',
                  'PRODUCTO',
                  'BOLSA',
                  'ETIQUETA',
                  'TURNO',
                ],
              },
              id: uuidDe(
                'el ítem a archivar (con TURNO, el id de la actividad que rota)',
                'listar_actividades',
                'listar_conductas',
                'listar_recompensas',
                'listar_tienda',
                'listar_etiquetas',
                'listar_turnos'
              ),
            },
            required: ['tipo', 'id'],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 25,
        },
        resumen: {
          type: 'string',
          description:
            'Una línea con el criterio: por qué estos y no otros. La lee el Tutor arriba de la ' +
            'lista, y en una propuesta que borra es lo primero que mira.',
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_quitar_marcas',
    descripcion:
      `Propone corregir lo anotado HOY: quitar una actividad marcada como hecha, deshacer una ` +
      `marca de "no hizo", o quitar una conducta registrada. ${NO_APLICA} ` +
      'Los ids salen de estado_de_hoy y **solo existen mientras la sesión está abierta**: no se ' +
      'puede corregir un día ya cerrado por acá. ' +
      'OJO con el sentido: quitar una hecha le RESTA los puntos que había ganado; deshacer un ' +
      '"no hizo" se los DEVUELVE. Decile al Tutor cuál de las dos cosas estás proponiendo.',
    parametros: {
      type: 'object',
      properties: {
        marcas: {
          type: 'array',
          description: 'Las marcas a corregir. Entre 1 y 50 por propuesta.',
          items: {
            type: 'object',
            description: 'Una marca de hoy.',
            properties: {
              registroId: uuidDe('la marca a corregir', 'estado_de_hoy'),
              tipo: {
                type: 'string',
                description:
                  'El mismo `tipo` con el que vino de estado_de_hoy. COMPLETADA la quita; ' +
                  'NO_HIZO y REPETICION_QUITADA la deshacen; CONDUCTA quita el registro.',
                enum: ['COMPLETADA', 'NO_HIZO', 'REPETICION_QUITADA', 'CONDUCTA'],
              },
              motivo: {
                type: 'string',
                description:
                  'Por qué se quita. **Lo lee el integrante en su pantalla**, así que escribilo ' +
                  'para él y no para el Tutor. Solo se usa al quitar una COMPLETADA. Máximo 200.',
              },
            },
            required: ['registroId', 'tipo'],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 50,
        },
        resumen: { type: 'string', description: 'Una línea con qué se corrige y por qué.' },
      },
      required: ['marcas'],
      additionalProperties: false,
    },
  },
  {
    nombre: 'proponer_ajustes_manuales',
    descripcion:
      `Propone darle o sacarle puntos y/o monedas a una persona por algo que pasó FUERA del ` +
      `catálogo: "ayudó con la mudanza", "se portó mal en lo de la abuela". ${NO_APLICA} ` +
      'Una fila por persona, con el número que corresponda y un motivo que los explica a los ' +
      'dos. Podés mandar solo puntos, solo monedas o los dos, pero al menos uno. ' +
      'Son dos números independientes y ninguno se calcula del otro: los puntos deciden la ' +
      'zona, las monedas lo que puede comprar. No conviertas de uno al otro. ' +
      'Mirá listar_billeteras antes de descontar monedas —**el saldo no puede quedar bajo 0**— ' +
      'y acordate de que un ajuste de PUNTOS necesita la sesión de hoy abierta. ' +
      'Para marcar una actividad del catálogo NO es esta: es la de anotar. Esto es para lo que ' +
      'no está en ninguna lista.',
    parametros: {
      type: 'object',
      properties: {
        ajustes: {
          type: 'array',
          description: 'Una fila por persona. Entre 1 y 25 por propuesta.',
          items: {
            type: 'object',
            description: 'El ajuste de una persona.',
            properties: {
              participanteId: uuidDe(
                'la persona a la que se le ajusta (el usuarioId que devuelve la lectura)',
                'listar_participantes',
                'listar_billeteras'
              ),
              puntos: {
                type: 'integer',
                description:
                  'Con signo: positivo suma, negativo resta. Nunca 0. Omitilo si el ajuste es ' +
                  'solo de monedas. El puntaje puede quedar negativo — la zona más baja existe.',
              },
              monedas: {
                type: 'integer',
                description:
                  'Con signo: positivo acredita, negativo descuenta. Nunca 0. Omitilo si el ' +
                  'ajuste es solo de puntos. **Descontar más de lo que la persona tiene se ' +
                  'rechaza**: mirá el saldo en listar_billeteras.',
              },
              motivo: {
                type: 'string',
                description:
                  'Por qué. Obligatorio, y cubre los dos números. **Queda en el historial y en ' +
                  'la auditoría**, así que escribí el hecho concreto ("ayudó con la mudanza") y ' +
                  'no una valoración de la persona. Máximo 200 caracteres.',
              },
            },
            required: ['participanteId', 'motivo'],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 25,
        },
        resumen: {
          type: 'string',
          description: 'Una línea con el criterio, para que el Tutor entienda de dónde salió.',
        },
      },
      required: ['ajustes'],
      additionalProperties: false,
    },
  },
];

export const NOMBRES_HERRAMIENTAS_PROPUESTA: readonly string[] = HERRAMIENTAS_PROPUESTA.map(
  (herramienta) => herramienta.nombre
);
