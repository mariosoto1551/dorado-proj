import { OrigenActividad } from '../generated/prisma/enums';

/**
 * Visibilidad del contenido creado por integrantes (spec fase-14-10, Parte C).
 *
 * Regla única del ítem 10: **un USUARIO ve una actividad si es del catálogo del
 * Tutor (`origen = TUTOR`) o si es la suya (`creadaPorUsuarioId = su id`)**. Un
 * TUTOR/ORG_ADMIN ve todas (necesita moderar).
 *
 * Está acá, en un solo lugar, a propósito: el filtro hay que aplicarlo en CADA
 * lectura de actividades que sirva a un usuario (listado, detalle, mi-estado-hoy,
 * completar, correcciones del tutor). Olvidarlo en una significa que un
 * integrante ve o completa la actividad personal de su hermano — y eso no lo
 * agarra ningún test de los que ya existían.
 */
export function filtroVisibilidadUsuario(usuarioId: string) {
  return {
    OR: [{ origen: OrigenActividad.TUTOR }, { creadaPorUsuarioId: usuarioId }],
  };
}

/** Versión en memoria de la misma regla, para filas ya leídas. */
export function esVisiblePara(
  actividad: { origen: string; creadaPorUsuarioId: string | null },
  usuarioId: string
): boolean {
  return (
    actividad.origen === OrigenActividad.TUTOR ||
    actividad.creadaPorUsuarioId === usuarioId
  );
}
