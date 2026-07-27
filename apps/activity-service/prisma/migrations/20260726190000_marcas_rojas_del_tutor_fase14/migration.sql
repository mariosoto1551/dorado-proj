-- fase-14-12: marcas rojas del tutor (denegar una obligatoria, quemar una
-- repetición). Retro-compatible: las tres columnas son nullable y arrancan en
-- NULL, así que ningún registro existente cambia de comportamiento. Las marcas
-- en sí no necesitan tabla nueva — ya son filas de RegistroActividad (una
-- COMPLETADA con eliminado = true, o un NO_HIZO).

-- AlterTable
ALTER TABLE "RegistroActividad" ADD COLUMN     "motivoTutor" TEXT,
ADD COLUMN     "revertidoPorTutorId" TEXT,
ADD COLUMN     "revertidoEn" TIMESTAMP(3);
