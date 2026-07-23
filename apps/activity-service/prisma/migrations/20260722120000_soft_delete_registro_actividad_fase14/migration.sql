-- Soft-delete de completadas de actividad (fase-14): el tutor puede quitar una
-- completada opcional de un usuario (o la confirmación de una obligatoria
-- overrideada por "no hizo"). Nunca DELETE físico — scoring compensa vía evento.
ALTER TABLE "RegistroActividad" ADD COLUMN "eliminado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RegistroActividad" ADD COLUMN "eliminadoPorTutorId" TEXT;
ALTER TABLE "RegistroActividad" ADD COLUMN "eliminadoEn" TIMESTAMP(3);
