import { esDeSuRol, filtroRolUsuario } from './restriccion-rol';
import { esVisiblePara, filtroVisibilidadUsuario } from './visibilidad-actividad';

/**
 * ¿Para quién es una Actividad? (spec fase-14-24.)
 *
 * Este archivo es el **punto de entrada único** de las tres reglas de
 * destinatario que el proyecto fue acumulando de a una:
 *
 * - **origen** (fase-14-10): la actividad personal de un integrante es solo suya.
 * - **rol** (fase-14-19): `rolesPermitidos`, dinámico — quien reciba el rol
 *   mañana queda incluido solo.
 * - **personas / equipos** (fase-14-24): `usuariosPermitidos` /
 *   `equiposPermitidos`, estáticos — una lista que el Tutor escribió.
 *
 * Están compuestas acá, y no llamadas sueltas en cada service, por el motivo que
 * los ítems 10 y 19 anotaron cada uno en su momento: el filtro hay que aplicarlo
 * en CADA lectura y CADA escritura que sirva a un participante, y **olvidarse de
 * una no lo agarra ningún test preexistente**. Con tres reglas sueltas, aplicar
 * dos y olvidar la tercera deja de ser un descuido improbable. El objetivo del
 * archivo es que sea imposible: quien aplica una, aplica las tres.
 *
 * Lo que se escapa se manifiesta como "el integrante ve la tarea de otro" o,
 * peor, como una obligatoria asignada a Ana que le resta puntos a todo el grupo
 * al cerrar la Sesión — y eso no se ve en ninguna pantalla hasta el día
 * siguiente.
 *
 * Un TUTOR/ORG_ADMIN **no pasa por acá**: ve todo, porque gestiona.
 *
 * ## Los cuatro modos son excluyentes
 *
 * El modo no se guarda: se deriva de qué array está lleno (decisión de la spec —
 * un enum no evitaría el estado inconsistente y sí obligaría a migrar toda fila
 * existente). La invariante "a lo sumo uno no vacío" la garantiza la validación
 * de escritura (`validarDestinatario`), no este archivo, que solo lee.
 */

/** Los campos de `Actividad` que deciden a quién le corresponde. */
export interface DestinatarioDeActividad {
  origen: string;
  creadaPorUsuarioId: string | null;
  rolesPermitidos: string[];
  usuariosPermitidos: string[];
  equiposPermitidos: string[];
}

/**
 * El participante, resuelto una vez por request. `rolGrupoId` y `equipoIds` solo
 * hacen falta si el catálogo tiene alguna actividad de ese modo — ver
 * `necesitaRoles` / `necesitaEquipos`, que son los que evitan pagar el cruce
 * REST en los grupos que no usan la capacidad (o sea, todos los de hoy).
 */
export interface ContextoParticipante {
  usuarioId: string;
  rolGrupoId: string | null;
  equipoIds: string[];
}

/** Modo de destinatario, derivado de los arrays. Para la UI y los mensajes. */
export type ModoDestinatario = 'TODOS' | 'ROLES' | 'USUARIOS' | 'EQUIPOS';

export function modoDestinatario(actividad: DestinatarioDeActividad): ModoDestinatario {
  if (actividad.usuariosPermitidos.length > 0) {
    return 'USUARIOS';
  }

  if (actividad.equiposPermitidos.length > 0) {
    return 'EQUIPOS';
  }

  if (actividad.rolesPermitidos.length > 0) {
    return 'ROLES';
  }

  return 'TODOS';
}

/**
 * ¿Esta actividad es para este participante? Las tres reglas, compuestas.
 *
 * Se evalúan todas aunque los modos sean excluyentes: `esDestinatario` no
 * confía en que la invariante se haya respetado al escribir. Si por un bug
 * quedaran dos arrays llenos, el resultado es el conjunto MÁS CHICO — con una
 * regla de visibilidad, fallar cerrando es lo correcto.
 */
export function esDestinatario(
  actividad: DestinatarioDeActividad,
  contexto: ContextoParticipante
): boolean {
  return (
    esVisiblePara(actividad, contexto.usuarioId) &&
    esDeSuRol(actividad, contexto.rolGrupoId) &&
    esDeSusPersonas(actividad, contexto.usuarioId) &&
    esDeSusEquipos(actividad, contexto.equipoIds)
  );
}

/** Filtro Prisma equivalente, para las lecturas que lo empujan a la query. */
export function filtroDestinatario(contexto: ContextoParticipante) {
  return {
    AND: [
      filtroVisibilidadUsuario(contexto.usuarioId),
      filtroRolUsuario(contexto.rolGrupoId),
      {
        OR: [
          { usuariosPermitidos: { isEmpty: true } },
          { usuariosPermitidos: { has: contexto.usuarioId } },
        ],
      },
      {
        OR: [
          { equiposPermitidos: { isEmpty: true } },
          ...(contexto.equipoIds.length > 0
            ? [{ equiposPermitidos: { hasSome: contexto.equipoIds } }]
            : []),
        ],
      },
    ],
  };
}

/** Versión en memoria de la parte "personas". */
export function esDeSusPersonas(
  actividad: Pick<DestinatarioDeActividad, 'usuariosPermitidos'>,
  usuarioId: string
): boolean {
  if (actividad.usuariosPermitidos.length === 0) {
    return true;
  }

  return actividad.usuariosPermitidos.includes(usuarioId);
}

/** Versión en memoria de la parte "equipos". */
export function esDeSusEquipos(
  actividad: Pick<DestinatarioDeActividad, 'equiposPermitidos'>,
  equipoIds: string[]
): boolean {
  if (actividad.equiposPermitidos.length === 0) {
    return true;
  }

  return actividad.equiposPermitidos.some((equipoId) => equipoIds.includes(equipoId));
}

/**
 * ¿Hace falta resolver los equipos del participante para este catálogo?
 *
 * Mismo patrón que `hayRestriccionesDeRol` (#19) y que el `necesitaTimezone` de
 * `mi-estado-hoy`: el cruce REST hacia identity se paga **solo** si alguna
 * actividad del grupo usa el modo equipos. En un grupo que no lo usa —o sea,
 * todos los que existen hoy— este ítem no agrega ni una llamada al camino
 * caliente.
 */
export function hayRestriccionesDeEquipo(
  actividades: Array<Pick<DestinatarioDeActividad, 'equiposPermitidos'>>
): boolean {
  return actividades.some((actividad) => actividad.equiposPermitidos.length > 0);
}

/** Ids de los equipos ACTIVO a los que pertenece el participante. */
export function equiposDelParticipante(
  equipos: Array<{ equipoId: string; estado: string; miembros: Array<{ usuarioId: string }> }>,
  usuarioId: string
): string[] {
  return equipos
    .filter(
      (equipo) =>
        equipo.estado === 'ACTIVO' &&
        equipo.miembros.some((miembro) => miembro.usuarioId === usuarioId)
    )
    .map((equipo) => equipo.equipoId);
}
