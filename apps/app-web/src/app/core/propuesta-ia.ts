import type {
  ActividadDto,
  ConductaDto,
  OperacionPropuestaIaDto,
  ProductoTiendaDto,
  PropuestaIaDto,
  RecompensaDto,
  RendimientoAccionDto,
  RolGrupoDto,
  UmbralZonaDto,
  UsuarioDto,
} from '@dorado/shared-types';

import { describirDias } from './dias-semana';

/**
 * El diff legible de una propuesta de la IA (fase-14-29 tanda 6), sin Angular
 * en el medio — mismo criterio que `core/termometro.ts` del #27 y
 * `core/calibracion-monedas.ts` del #28.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE ARCHIVO EXISTE PARA EVITAR:
 *
 * la operación que viaja en la propuesta es **el request del endpoint destino,
 * literal** — `{"tipoLimiteTiempo":"DEADLINE","deadlineHora":"20:00",
 * "repeticionesMaximasSeccion":null}`. Mostrar eso en pantalla sería pedirle al
 * Tutor que apruebe algo que no puede leer, y aprobar sin leer es exactamente
 * lo que la decisión 2 («la IA propone, el humano aplica») no quiere que pase:
 * si el humano no entiende lo que aprueba, la revisión humana es un botón, no
 * un control.
 *
 * Por eso la traducción vive acá y no en el servidor: el servidor guarda la
 * forma que hace que aplicar sea un `for` (decisión 6), y esta es la única
 * capa que puede darse el lujo de ser bonita.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Un campo que cambia. `antes: null` significa que es un alta, no una edición. */
export interface CambioPropuesta {
  campo: string;
  antes: string | null;
  despues: string;
}

export interface FilaPropuesta {
  opId: string;
  /** «Crear «Tender la cama»» — lo que se lee sin abrir el detalle. */
  titulo: string;
  cambios: CambioPropuesta[];
}

/**
 * El estado actual del grupo, para poder decir «antes» y para traducir ids a
 * nombres. Todo opcional: sin contexto la tarjeta se dibuja igual, con menos
 * información —lo que no se puede es *inventar* un valor anterior—.
 */
export interface ContextoPropuesta {
  actividades?: readonly ActividadDto[];
  /** fase-14-30 tanda 4: para decir el «antes» de una conducta editada. */
  conductas?: readonly ConductaDto[];
  /** fase-14-30 tanda 5: el «antes» de un premio o castigo editado. */
  recompensas?: readonly RecompensaDto[];
  productos?: readonly ProductoTiendaDto[];
  rendimientos?: readonly RendimientoAccionDto[];
  /**
   * Roles y participantes van enteros y no como mapa de nombres desde la tanda
   * 7, por el mismo motivo que las zonas en la 6: **una propuesta los edita**,
   * así que hace falta el «antes» de cada campo (el color de un rol, el rol que
   * hoy tiene una persona) y no solo cómo se llaman. Los que siguen siendo
   * mapas —equipos, bolsas, etiquetas— es porque solo se los referencia por id.
   */
  roles?: readonly RolGrupoDto[];
  personas?: readonly UsuarioDto[];
  equipos?: ReadonlyMap<string, string>;
  /** Los dos de la tanda 5, solo para traducir ids a nombres. */
  bolsas?: ReadonlyMap<string, string>;
  etiquetas?: ReadonlyMap<string, string>;
  /**
   * Las zonas enteras y no un mapa de nombres (fase-14-30 tanda 6): la tanda 5
   * solo necesitaba traducir un `umbralZonaId`, pero una propuesta de escala
   * edita la zona, así que hace falta el «antes» de cada campo. El mapa de
   * nombres se deriva de acá — dos formas del mismo dato en el contexto sería
   * pedirle a la pantalla que mande lo mismo dos veces.
   */
  umbrales?: readonly UmbralZonaDto[];
  /** La base de puntos del grupo, para el «antes» de esa fila. */
  puntosIniciales?: number;
}

/** Etiqueta legible de cada campo del request de una actividad. */
const ETIQUETAS: Record<string, string> = {
  nombre: 'Nombre',
  descripcion: 'Descripción',
  tipoPuntaje: 'Tipo',
  valorPuntos: 'Puntos',
  puntosPorCumplir: 'Puntos por cumplir',
  tipoLimiteTiempo: 'Límite de tiempo',
  deadlineHora: 'Hora tope',
  duracionCronometroMinutos: 'Cronómetro',
  repeticionesMaximasSesion: 'Máximo por día',
  repeticionesMinimasSesion: 'Mínimo por día',
  repeticionesMaximasSeccion: 'Máximo por semana',
  comportamientoAlCierre: 'Al cerrar la sesión',
  alcance: 'Alcance',
  bonoJefePuntos: 'Bono al jefe',
  diasSemana: 'Días',
  siempreVisible: 'Siempre visible',
  rolesPermitidos: 'Roles',
  usuariosPermitidos: 'Personas',
  equiposPermitidos: 'Equipos',
  vigenteDesde: 'Vigente desde',
  vigenteHasta: 'Vigente hasta',
  precio: 'Precio',
  imagenUrl: 'Imagen',
  // fase-14-30 tanda 4. `tipo` y `nombre` ya están arriba: los comparte con la
  // actividad, que es lo que hace que este mapa siga siendo uno solo.
  permiteAutoreporte: 'Se puede autorreportar',
  modo: 'Orden',
  frecuencia: 'Cambia',
  activo: 'Activa',
  // fase-14-30 tanda 5.
  umbralZonaId: 'Zona',
  permiteSeleccion: 'Se puede elegir',
  permiteAzar: 'Puede salir sorteada',
  fuente: 'Entrega',
  mecanica: 'Cómo se obtiene',
  recompensaId: 'Premio',
  bolsaId: 'Bolsa',
  recompensaIds: 'Premios',
  etiquetaIds: 'Etiquetas',
  // fase-14-30 tanda 6. Van antes del color a propósito: el orden de este mapa
  // es el orden en que se leen las filas de la tarjeta.
  nombreZona: 'Zona',
  orden: 'Posición en la escala',
  puntosMin: 'Desde',
  puntosMax: 'Hasta',
  puntosIniciales: 'Arranca con',
  // fase-14-30 tanda 7. Son los nombres del CONTRATO de identity, no los que ve
  // el modelo: lo que llega en el body ya está traducido.
  rolGrupoId: 'Rol',
  jefeUsuarioId: 'Jefe',
  miembrosIds: 'Integrantes',
  nuevoJefeUsuarioId: 'Nuevo jefe',
  colorHex: 'Color',
};

const VALORES: Record<string, string> = {
  OPCIONAL: 'Opcional',
  OBLIGATORIA: 'Obligatoria',
  SIN_LIMITE: 'Sin límite',
  DEADLINE: 'Con hora tope',
  CRONOMETRO: 'Con cronómetro',
  ASUME_HECHA: 'Se asume hecha',
  REQUIERE_CONFIRMACION: 'Hay que confirmarla',
  INDIVIDUAL: 'Individual',
  EQUIPO: 'De equipo',
  // fase-14-30 tanda 4.
  BUENA: 'Buena',
  MALA: 'Mala',
  ORDEN_FIJO: 'El que escribiste',
  // «Al azar» a secas y no «al azar en cada vuelta»: el mismo valor es el modo
  // de una rotación y la mecánica de un producto (fase-14-30 tanda 5), y este
  // mapa es uno solo para todos los tipos de propuesta.
  AZAR: 'Al azar',
  SESION: 'Todos los días',
  SECCION: 'Una vez por sección',
  // fase-14-30 tanda 5.
  PREMIO: 'Premio',
  CASTIGO: 'Castigo',
  ITEM: 'Un premio concreto',
  BOLSA: 'Algo de una bolsa',
  ELECCION: 'A elección',
};

/** Traduce una propuesta entera a filas legibles. */
export function armarFilas(
  propuesta: PropuestaIaDto,
  contexto: ContextoPropuesta = {}
): FilaPropuesta[] {
  return propuesta.operaciones.map((operacion) => {
    switch (propuesta.tipo) {
      case 'CREAR_ACTIVIDADES':
        return filaDeAlta(operacion, contexto);

      case 'EDITAR_ACTIVIDADES':
        return filaDeEdicion(operacion, contexto);

      case 'PRECIOS_TIENDA':
        return filaDePrecio(operacion, contexto);

      case 'RENDIMIENTOS_MONEDAS':
        return filaDeRendimientos(operacion, contexto);

      case 'CREAR_CONDUCTAS':
        return filaDeAlta(operacion, contexto);

      case 'EDITAR_CONDUCTAS':
        return filaDeConductaEditada(operacion, contexto);

      case 'TURNOS':
        return filaDeTurno(operacion, contexto);

      case 'CREAR_RECOMPENSAS':
        return filaDeAlta(operacion, contexto);

      case 'EDITAR_RECOMPENSAS':
        return filaDeRecompensaEditada(operacion, contexto);

      case 'PRODUCTOS_TIENDA':
        return filaDeAltaEnLaTienda(operacion, contexto);

      case 'ETIQUETAS':
        return filaDeEtiquetas(operacion, contexto);

      case 'UMBRALES_ZONA':
        return filaDeLaEscala(operacion, contexto);

      case 'ROLES_GRUPO':
        return filaDeRol(operacion, contexto);

      case 'EQUIPOS':
        return filaDeEquipo(operacion, contexto);
    }
  });
}

/**
 * Los roles del grupo: crear uno (`POST`), cambiarlo (`PATCH`) o decidir cuál
 * le queda a una persona (`PUT`). El id de la persona viaja **en la ruta**, que
 * es lo que hace que el título pueda decir su nombre.
 */
function filaDeRol(
  operacion: OperacionPropuestaIaDto,
  contexto: ContextoPropuesta
): FilaPropuesta {
  const body = comoObjeto(operacion.body);

  if (operacion.metodo === 'POST') {
    return {
      opId: operacion.opId,
      titulo: `Crear rol «${String(body['nombre'] ?? 'sin nombre')}»`,
      cambios: cambiosDe(body, contexto, undefined, ['nombre']),
    };
  }

  if (operacion.metodo === 'PATCH') {
    const actual = (contexto.roles ?? []).find((rol) => rol.id === idDeLaRuta(operacion.ruta));

    return {
      opId: operacion.opId,
      titulo: `Cambiar el rol «${actual?.nombre ?? 'sin nombre'}»`,
      cambios: cambiosDe(body, contexto, actual as unknown as Record<string, unknown> | undefined),
    };
  }

  // La ruta es `/identity/grupos/:grupoId/usuarios/:usuarioId/rol`.
  const persona = (contexto.personas ?? []).find(
    (usuario) => usuario.id === operacion.ruta.split('/').filter(Boolean).at(-2)
  );

  return {
    opId: operacion.opId,
    titulo: `Rol de ${persona?.nombre ?? 'un participante'}`,
    cambios: cambiosDe(body, contexto, { rolGrupoId: persona?.rolGrupo?.id ?? null }),
  };
}

/**
 * Los equipos mezclan cuatro operaciones y se distinguen por la ruta y el
 * método, igual que la tienda en la tanda 5. Las dos de gente —sumar un
 * integrante y cambiar el jefe— dicen todo en el título: una fila de diff con
 * un solo campo sería más ruido que información.
 */
function filaDeEquipo(
  operacion: OperacionPropuestaIaDto,
  contexto: ContextoPropuesta
): FilaPropuesta {
  const body = comoObjeto(operacion.body);

  if (operacion.ruta.endsWith('/equipos')) {
    return {
      opId: operacion.opId,
      titulo: `Crear equipo «${String(body['nombre'] ?? 'sin nombre')}»`,
      cambios: cambiosDe(body, contexto, undefined, ['nombre']),
    };
  }

  // En las tres restantes el id del equipo es el último de la ruta o el
  // anteúltimo, según si la ruta termina en el equipo o en el sub-recurso.
  const partes = operacion.ruta.split('/').filter(Boolean);
  const equipoId = operacion.metodo === 'PATCH' ? partes.at(-1) : partes.at(-2);
  const nombreEquipo = contexto.equipos?.get(equipoId ?? '') ?? 'un equipo';

  if (operacion.metodo === 'PATCH') {
    return {
      opId: operacion.opId,
      titulo: `Cambiar el equipo «${nombreEquipo}»`,
      cambios: cambiosDe(body, contexto, { nombre: nombreEquipo }),
    };
  }

  if (operacion.ruta.endsWith('/miembros')) {
    return {
      opId: operacion.opId,
      titulo: `Sumar a ${formatear('usuarioId', body['usuarioId'], contexto)} al equipo «${nombreEquipo}»`,
      cambios: [],
    };
  }

  return {
    opId: operacion.opId,
    titulo: `Nuevo jefe del equipo «${nombreEquipo}»`,
    cambios: cambiosDe(body, contexto),
  };
}

/**
 * La escala mezcla tres operaciones: crear una zona (`POST`), cambiarla
 * (`PATCH`) y mover la base de puntos (`PUT` a la configuración). Se
 * distinguen por la ruta y el método, que es el dato que ya viaja.
 *
 * La fila de la base va sola y no junto a las zonas porque no es una zona: es
 * cuántos puntos tiene cada uno antes de empezar, y mueve a todos por igual
 * sobre la escala que las zonas definen.
 */
function filaDeLaEscala(
  operacion: OperacionPropuestaIaDto,
  contexto: ContextoPropuesta
): FilaPropuesta {
  const body = comoObjeto(operacion.body);

  if (operacion.ruta.endsWith('/configuracion')) {
    return {
      opId: operacion.opId,
      titulo: 'Puntos con los que arranca cada sección',
      cambios: cambiosDe(
        body,
        contexto,
        contexto.puntosIniciales === undefined
          ? undefined
          : { puntosIniciales: contexto.puntosIniciales }
      ),
    };
  }

  if (operacion.metodo === 'POST') {
    return {
      opId: operacion.opId,
      titulo: `Crear zona «${String(body['nombreZona'] ?? 'sin nombre')}»`,
      cambios: cambiosDe(body, contexto, undefined, ['nombreZona']),
    };
  }

  const actual = (contexto.umbrales ?? []).find(
    (umbral) => umbral.id === idDeLaRuta(operacion.ruta)
  );

  return {
    opId: operacion.opId,
    titulo: `Cambiar «${actual?.nombreZona ?? 'una zona'}»`,
    cambios: cambiosDe(body, contexto, actual as unknown as Record<string, unknown> | undefined),
  };
}

function filaDeAlta(
  operacion: OperacionPropuestaIaDto,
  contexto: ContextoPropuesta
): FilaPropuesta {
  const body = comoObjeto(operacion.body);

  return {
    opId: operacion.opId,
    titulo: `Crear «${String(body['nombre'] ?? 'sin nombre')}»`,
    // El nombre ya está en el título: repetirlo abajo es ruido.
    cambios: cambiosDe(body, contexto, undefined, ['nombre']),
  };
}

function filaDeEdicion(
  operacion: OperacionPropuestaIaDto,
  contexto: ContextoPropuesta
): FilaPropuesta {
  const body = comoObjeto(operacion.body);
  const actual = (contexto.actividades ?? []).find(
    (actividad) => actividad.id === idDeLaRuta(operacion.ruta)
  );

  return {
    opId: operacion.opId,
    titulo: `Editar «${actual?.nombre ?? 'una actividad'}»`,
    cambios: cambiosDe(body, contexto, actual as unknown as Record<string, unknown> | undefined),
  };
}

function filaDeConductaEditada(
  operacion: OperacionPropuestaIaDto,
  contexto: ContextoPropuesta
): FilaPropuesta {
  const actual = (contexto.conductas ?? []).find(
    (conducta) => conducta.id === idDeLaRuta(operacion.ruta)
  );

  return {
    opId: operacion.opId,
    titulo: `Editar «${actual?.nombre ?? 'una conducta'}»`,
    cambios: cambiosDe(
      comoObjeto(operacion.body),
      contexto,
      actual as unknown as Record<string, unknown> | undefined
    ),
  };
}

/**
 * La rotación de una actividad.
 *
 * La secuencia se muestra **numerada y con los repetidos**: que alguien
 * aparezca dos veces es lo que le da el doble de turnos (fase-14-21), así que
 * una tarjeta que la deduplicara «para limpiar» le escondería al Tutor
 * justamente lo que tiene que aprobar.
 */
function filaDeTurno(
  operacion: OperacionPropuestaIaDto,
  contexto: ContextoPropuesta
): FilaPropuesta {
  const body = comoObjeto(operacion.body);
  const actividad = (contexto.actividades ?? []).find(
    // La ruta es `/activity/actividades/:id/turno`: el id es el anteúltimo.
    (fila) => fila.id === operacion.ruta.split('/').filter(Boolean).at(-2)
  );
  const posiciones = (body['posiciones'] ?? []) as Array<Record<string, unknown>>;

  return {
    opId: operacion.opId,
    titulo: `Rotar «${actividad?.nombre ?? 'una actividad'}»`,
    cambios: [
      ...cambiosDe(body, contexto, undefined, ['posiciones']),
      ...posiciones.map((posicion, indice) => ({
        campo: `Turno ${indice + 1}`,
        antes: null,
        despues: nombresDe([posicion['usuarioId']], mapaDePersonas(contexto), '—'),
      })),
    ],
  };
}

function filaDeRecompensaEditada(
  operacion: OperacionPropuestaIaDto,
  contexto: ContextoPropuesta
): FilaPropuesta {
  const actual = (contexto.recompensas ?? []).find(
    (recompensa) => recompensa.id === idDeLaRuta(operacion.ruta)
  );

  return {
    opId: operacion.opId,
    titulo: `Editar «${actual?.nombre ?? 'un premio o castigo'}»`,
    cambios: cambiosDe(
      comoObjeto(operacion.body),
      contexto,
      actual as unknown as Record<string, unknown> | undefined
    ),
  };
}

/**
 * Una propuesta de tienda mezcla dos altas distintas —bolsas y productos— en
 * un solo array de operaciones, y en ese orden. Se distinguen por la ruta, que
 * es el dato que ya viaja: agregarle un campo «tipo de operación» al DTO sería
 * duplicar en la propuesta algo que la ruta ya dice sin ambigüedad.
 */
function filaDeAltaEnLaTienda(
  operacion: OperacionPropuestaIaDto,
  contexto: ContextoPropuesta
): FilaPropuesta {
  const body = comoObjeto(operacion.body);
  const esBolsa = operacion.ruta.endsWith('/bolsas');
  const nombre = String(body['nombre'] ?? 'sin nombre');

  return {
    opId: operacion.opId,
    titulo: esBolsa ? `Crear bolsa «${nombre}»` : `Publicar «${nombre}»`,
    cambios: cambiosDe(body, contexto, undefined, ['nombre']),
  };
}

/**
 * Las etiquetas también mezclan dos operaciones: crear una etiqueta del
 * catálogo (`POST`) y decidir cuáles le quedan puestas a un ítem (`PUT`, que
 * **reemplaza la lista completa**). La lista vacía es una operación legítima y
 * la tarjeta lo dice con todas las letras: «se le sacan todas».
 */
function filaDeEtiquetas(
  operacion: OperacionPropuestaIaDto,
  contexto: ContextoPropuesta
): FilaPropuesta {
  const body = comoObjeto(operacion.body);

  if (operacion.metodo === 'POST') {
    return {
      opId: operacion.opId,
      titulo: `Crear etiqueta «${String(body['nombre'] ?? 'sin nombre')}»`,
      cambios: cambiosDe(body, contexto, undefined, ['nombre']),
    };
  }

  const actual = (contexto.recompensas ?? []).find(
    // La ruta es `/rewards/recompensas/:id/etiquetas`: el id es el anteúltimo.
    (recompensa) => recompensa.id === operacion.ruta.split('/').filter(Boolean).at(-2)
  );
  const ids = (body['etiquetaIds'] ?? []) as string[];

  return {
    opId: operacion.opId,
    titulo: `Etiquetas de «${actual?.nombre ?? 'un premio o castigo'}»`,
    cambios: [
      {
        campo: 'Etiquetas',
        antes: actual
          ? nombresDe(
              actual.etiquetas.map((etiqueta) => etiqueta.id),
              contexto.etiquetas,
              'ninguna'
            )
          : null,
        despues: ids.length === 0 ? 'ninguna' : nombresDe(ids, contexto.etiquetas, 'ninguna'),
      },
    ],
  };
}

function filaDePrecio(
  operacion: OperacionPropuestaIaDto,
  contexto: ContextoPropuesta
): FilaPropuesta {
  const body = comoObjeto(operacion.body);
  const producto = (contexto.productos ?? []).find(
    (fila) => fila.id === idDeLaRuta(operacion.ruta)
  );

  return {
    opId: operacion.opId,
    titulo: producto?.nombre ?? 'Un producto de la tienda',
    cambios: cambiosDe(body, contexto, producto as unknown as Record<string, unknown> | undefined),
  };
}

/**
 * El `PUT` de rendimientos es **un solo request con todo adentro** (así lo
 * definió el #28), así que esta propuesta tiene una sola operación aunque
 * toque veinte acciones. La fila las abre igual: aprobar «actualizar 20
 * acciones» sin ver cuáles es aprobar a ciegas.
 */
function filaDeRendimientos(
  operacion: OperacionPropuestaIaDto,
  contexto: ContextoPropuesta
): FilaPropuesta {
  const filas = (comoObjeto(operacion.body)['rendimientos'] ?? []) as Array<
    Record<string, unknown>
  >;
  const actuales = contexto.rendimientos ?? [];

  return {
    opId: operacion.opId,
    titulo: `Lo que paga cada acción (${filas.length})`,
    cambios: filas.map((fila) => {
      const actual = actuales.find((r) => r.origenId === fila['origenId']);
      const monedas = Number(fila['monedas'] ?? 0);

      return {
        campo: actual?.nombre ?? 'Una acción',
        antes: actual ? `${actual.monedas} 🪙` : null,
        despues: `${monedas} 🪙`,
      };
    }),
  };
}

/**
 * Los campos del body, traducidos, **salteando los que no cambian nada**.
 *
 * Ese filtro es la mitad del valor de la tarjeta: el modelo emite todas las
 * propiedades del esquema siempre (no puede omitirlas — lo aprendió la tanda
 * 5), así que una edición que solo sube los puntos igual llega con veinte
 * campos. Mostrar los veinte escondería el único que importa.
 */
function cambiosDe(
  body: Record<string, unknown>,
  contexto: ContextoPropuesta,
  actual?: Record<string, unknown>,
  omitir: string[] = []
): CambioPropuesta[] {
  const cambios: CambioPropuesta[] = [];

  // Se recorre el orden de ETIQUETAS y no el del body a propósito: el orden de
  // las claves que emite el modelo es cosa suya y cambia entre respuestas, así
  // que dos propuestas del mismo tipo se leerían distinto sin ninguna razón.
  // Acá el orden es una decisión: primero qué es y cuánto vale, después el
  // detalle.
  for (const campo of Object.keys(ETIQUETAS)) {
    if (omitir.includes(campo) || !(campo in body)) {
      continue;
    }

    const despues = formatear(campo, body[campo], contexto);
    const antes = actual ? formatear(campo, actual[campo], contexto) : null;

    if (antes === despues) {
      continue;
    }

    cambios.push({ campo: ETIQUETAS[campo], antes, despues });
  }

  return cambios;
}

function formatear(campo: string, valor: unknown, contexto: ContextoPropuesta): string {
  // Va ANTES del guioncito general: en una zona, `puntosMax: null` no es un
  // campo vacío, es la zona más alta. Mostrarlo como «—» diría lo contrario de
  // lo que dice, justo en la fila que el Tutor tiene que entender.
  if (campo === 'puntosMax' && valor === null) {
    return 'sin techo';
  }

  // Ídem con el rol de una persona (tanda 7): `null` es «sin rol», que es un
  // estado con nombre y no la ausencia de un dato.
  if (campo === 'rolGrupoId' && valor === null) {
    return 'sin rol';
  }

  if (valor === null || valor === undefined || valor === '') {
    return '—';
  }

  if (campo === 'diasSemana' && Array.isArray(valor)) {
    return valor.length === 0 ? 'todos los días' : describirDias(valor as number[]);
  }

  if (campo === 'rolesPermitidos') {
    return nombresDe(valor, mapaDeRoles(contexto), 'todos');
  }

  if (campo === 'usuariosPermitidos') {
    return nombresDe(valor, mapaDePersonas(contexto), 'todos');
  }

  // Los campos de personas de la tanda 7. Van con el nombre del contrato de
  // identity porque es lo que viaja en el body, no lo que vio el modelo.
  if (campo === 'usuarioId' || campo === 'jefeUsuarioId' || campo === 'nuevoJefeUsuarioId') {
    return nombresDe([valor], mapaDePersonas(contexto), '—');
  }

  if (campo === 'miembrosIds') {
    return nombresDe(valor, mapaDePersonas(contexto), 'solo el jefe');
  }

  if (campo === 'rolGrupoId') {
    return nombresDe([valor], mapaDeRoles(contexto), 'sin rol');
  }

  if (campo === 'equiposPermitidos') {
    return nombresDe(valor, contexto.equipos, 'todos');
  }

  if (campo === 'recompensaIds') {
    return nombresDe(valor, mapaDeRecompensas(contexto), 'ninguno');
  }

  if (campo === 'etiquetaIds') {
    return nombresDe(valor, contexto.etiquetas, 'ninguna');
  }

  // Los tres ids sueltos de la tanda 5. Un id que no está en el mapa se muestra
  // recortado, igual que en las listas: ocultarlo haría que la tarjeta mienta.
  if (campo === 'recompensaId') {
    return nombresDe([valor], mapaDeRecompensas(contexto), '—');
  }

  if (campo === 'bolsaId') {
    return nombresDe([valor], contexto.bolsas, '—');
  }

  if (campo === 'umbralZonaId') {
    return nombresDe([valor], mapaDeZonas(contexto), '—');
  }

  if (campo === 'puntosIniciales') {
    return `${String(valor)} puntos`;
  }

  if (campo === 'duracionCronometroMinutos') {
    return `${String(valor)} min`;
  }

  if (campo === 'precio') {
    return `${String(valor)} 🪙`;
  }

  if (typeof valor === 'boolean') {
    return valor ? 'Sí' : 'No';
  }

  return VALORES[String(valor)] ?? String(valor);
}

/**
 * Una lista de ids como nombres. Un id que no está en el mapa se muestra
 * recortado en vez de ocultarse: que aparezca algo ilegible es una señal de
 * que hay que mirar, y ocultarlo haría que la tarjeta mienta por omisión.
 */
function nombresDe(
  valor: unknown,
  mapa: ReadonlyMap<string, string> | undefined,
  vacio: string
): string {
  if (!Array.isArray(valor) || valor.length === 0) {
    return vacio;
  }

  return (valor as string[])
    .map((id) => mapa?.get(id) ?? `${id.slice(0, 8)}…`)
    .join(', ');
}

/**
 * Los nombres de premios y castigos, del mismo listado que ya se usa para el
 * «antes». Se arma acá y no en el contexto para no pedirle a la pantalla que
 * mande la misma información dos veces con dos formas distintas.
 */
function mapaDeRecompensas(contexto: ContextoPropuesta): ReadonlyMap<string, string> {
  return new Map((contexto.recompensas ?? []).map((fila) => [fila.id, fila.nombre]));
}

/** Ídem con las zonas: el contexto las trae enteras, acá solo hacen falta los nombres. */
function mapaDeZonas(contexto: ContextoPropuesta): ReadonlyMap<string, string> {
  return new Map((contexto.umbrales ?? []).map((zona) => [zona.id, zona.nombreZona]));
}

function mapaDeRoles(contexto: ContextoPropuesta): ReadonlyMap<string, string> {
  return new Map((contexto.roles ?? []).map((rol) => [rol.id, rol.nombre]));
}

function mapaDePersonas(contexto: ContextoPropuesta): ReadonlyMap<string, string> {
  return new Map((contexto.personas ?? []).map((persona) => [persona.id, persona.nombre]));
}

/** El id del final de `/activity/actividades/:id`, `/rewards/productos/:id` o `/scoring/umbrales/:id`. */
function idDeLaRuta(ruta: string): string {
  return ruta.split('/').filter(Boolean).at(-1) ?? '';
}

function comoObjeto(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

/** Una propuesta que ya no se puede aplicar (aplicada, descartada o vencida). */
export function estaCerrada(propuesta: PropuestaIaDto): boolean {
  return propuesta.estado !== 'BORRADOR';
}

/** Cuánto le queda de vida, para el aviso de la tarjeta. */
export function horasHastaVencer(propuesta: PropuestaIaDto, ahora = new Date()): number {
  const restante = new Date(propuesta.venceEn).getTime() - ahora.getTime();

  return Math.max(0, Math.floor(restante / (60 * 60 * 1000)));
}
