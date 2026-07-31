/**
 * Restricción de una Actividad a ciertos roles del Grupo (spec fase-14-19).
 *
 * Regla única: **un participante ve una actividad si no tiene restricción de rol
 * (`rolesPermitidos` vacío) o si su rol está en la lista**. Sin rol asignado,
 * solo ve las no restringidas. Un TUTOR/ORG_ADMIN ve todas (necesita gestionar).
 *
 * Está acá, en un solo lugar, por el mismo motivo que `visibilidad-actividad.ts`:
 * el filtro hay que aplicarlo en CADA lectura y en cada escritura que sirva a un
 * participante — `mi-estado-hoy`, el listado, el detalle, completar/confirmar, el
 * plan del día y **el castigo automático al cerrar la Sesión**.
 *
 * Ese último es el que duele: si se olvida, una obligatoria de "limpieza" resta
 * puntos a quien nunca tuvo ese rol, y no se ve en ninguna pantalla — aparece
 * como puntaje negativo inexplicable al día siguiente.
 */

/** Filtro Prisma: sin restricción + las del rol del participante. */
export function filtroRolUsuario(rolGrupoId: string | null) {
  if (!rolGrupoId) {
    return { rolesPermitidos: { isEmpty: true } };
  }

  return {
    OR: [{ rolesPermitidos: { isEmpty: true } }, { rolesPermitidos: { has: rolGrupoId } }],
  };
}

/** Versión en memoria de la misma regla, para filas ya leídas. */
export function esDeSuRol(
  actividad: { rolesPermitidos: string[] },
  rolGrupoId: string | null
): boolean {
  if (actividad.rolesPermitidos.length === 0) {
    return true;
  }

  return rolGrupoId !== null && actividad.rolesPermitidos.includes(rolGrupoId);
}

/**
 * ¿Hace falta resolver roles para este catálogo? (decisión 13 de la spec.)
 *
 * El cruce REST hacia identity se paga SOLO si alguna actividad del grupo está
 * restringida. En un grupo que no usa roles —o sea, todos los que existen hoy—
 * este ítem no agrega ni una llamada al camino caliente. Mismo patrón que el
 * `necesitaTimezone` de `mi-estado-hoy`.
 */
export function hayRestriccionesDeRol(
  actividades: Array<{ rolesPermitidos: string[] }>
): boolean {
  return actividades.some((actividad) => actividad.rolesPermitidos.length > 0);
}
