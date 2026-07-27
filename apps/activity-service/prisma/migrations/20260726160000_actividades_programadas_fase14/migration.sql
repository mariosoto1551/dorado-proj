-- fase-14-11: actividades programadas (solo ciertos días de la semana).
-- Retro-compatible: toda actividad preexistente queda con el array vacío, que
-- significa "todos los días" — el comportamiento previo al ítem 11.

-- AlterTable
ALTER TABLE "Actividad" ADD COLUMN     "diasSemana" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
