import type {
  ActividadDto,
  ConductaDto,
  OperacionPropuestaIaDto,
  ProductoTiendaDto,
  PropuestaIaDto,
  RendimientoAccionDto,
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
  productos?: readonly ProductoTiendaDto[];
  rendimientos?: readonly RendimientoAccionDto[];
  roles?: ReadonlyMap<string, string>;
  personas?: ReadonlyMap<string, string>;
  equipos?: ReadonlyMap<string, string>;
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
  AZAR: 'Al azar en cada vuelta',
  SESION: 'Todos los días',
  SECCION: 'Una vez por sección',
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
    }
  });
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
        despues: nombresDe([posicion['usuarioId']], contexto.personas, '—'),
      })),
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
  if (valor === null || valor === undefined || valor === '') {
    return '—';
  }

  if (campo === 'diasSemana' && Array.isArray(valor)) {
    return valor.length === 0 ? 'todos los días' : describirDias(valor as number[]);
  }

  if (campo === 'rolesPermitidos') {
    return nombresDe(valor, contexto.roles, 'todos');
  }

  if (campo === 'usuariosPermitidos') {
    return nombresDe(valor, contexto.personas, 'todos');
  }

  if (campo === 'equiposPermitidos') {
    return nombresDe(valor, contexto.equipos, 'todos');
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

/** El id del final de `/activity/actividades/:id` o `/rewards/productos/:id`. */
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
