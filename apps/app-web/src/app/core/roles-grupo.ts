import type { RolGrupoDto } from '@dorado/shared-types';

/**
 * Reglas de presentación de los roles del grupo (fase-14-19). Acá y no en la
 * página porque son decisiones sobre QUÉ decirle al Tutor, y eso se testea.
 */

/**
 * ¿La actividad quedó restringida a roles que hoy no tiene nadie?
 *
 * Es el caso de la decisión 12 de la spec: al archivar un rol se desasigna de
 * todos sus integrantes, así que las actividades que lo pedían dejan de verse
 * **para todo el grupo** sin que nada lo anuncie. El Tutor las sigue viendo en
 * su catálogo, y este es el aviso de que están muertas en vida.
 *
 * Un rol que ya no está en el catálogo cuenta como "sin nadie": si se archivó,
 * el listado activo no lo trae y nadie lo tiene.
 */
export function sinIntegrantesConEsosRoles(
  rolesPermitidos: readonly string[],
  rolesDelGrupo: readonly RolGrupoDto[]
): boolean {
  // Sin restricción la ven todos; sin catálogo cargado no se puede afirmar nada
  // (y un aviso falso es peor que ninguno).
  if (rolesPermitidos.length === 0 || rolesDelGrupo.length === 0) {
    return false;
  }

  const asignadosPorRol = new Map(
    rolesDelGrupo.map((rol) => [rol.id, rol.cantidadAsignados ?? 0])
  );

  return rolesPermitidos.every((rolId) => (asignadosPorRol.get(rolId) ?? 0) === 0);
}
