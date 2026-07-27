-- fase-14-13: anular una tarea de equipo completada (marcas rojas, parte 2).
-- Retro-compatible: toda completada de equipo previa queda eliminado = false,
-- que es exactamente su estado actual, y las cinco columnas de metadatos
-- arrancan en NULL.

-- AlterTable
ALTER TABLE "RegistroTareaEquipo" ADD COLUMN     "eliminado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "eliminadoPorTutorId" TEXT,
ADD COLUMN     "eliminadoEn" TIMESTAMP(3),
ADD COLUMN     "motivoTutor" TEXT,
ADD COLUMN     "revertidoPorTutorId" TEXT,
ADD COLUMN     "revertidoEn" TIMESTAMP(3);
