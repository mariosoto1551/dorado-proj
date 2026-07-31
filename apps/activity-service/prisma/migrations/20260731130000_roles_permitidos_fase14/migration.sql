-- fase-14-19: restricción de una Actividad a ciertos roles del Grupo.
-- Retro-compatible: toda actividad existente queda con el array vacío, que
-- significa "la ven todos" — exactamente el comportamiento previo al ítem.
-- Sin FK a RolGrupo a propósito: esa tabla vive en la base de identity y ningún
-- servicio hace join contra la base de otro (regla 2).

-- AlterTable
ALTER TABLE "Actividad" ADD COLUMN "rolesPermitidos" TEXT[] DEFAULT ARRAY[]::TEXT[];
