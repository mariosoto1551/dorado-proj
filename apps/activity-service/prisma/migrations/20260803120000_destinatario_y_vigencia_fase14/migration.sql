-- fase-14-24: destinatario y vigencia de una Actividad.
--
-- Retro-compatible por construcción: toda actividad existente queda con los dos
-- arrays vacíos (= "sin modo de destinatario activo", o sea todo el grupo) y las
-- dos fechas en NULL (= permanente). Ninguna fila cambia de comportamiento.
--
-- Sin FK a Usuario ni a Equipo a propósito: ambas tablas viven en la base de
-- identity y ningún servicio hace join contra la base de otro (regla 2). Los ids
-- se validan por REST interno al escribir, igual que `rolesPermitidos` (#19).
--
-- Las fechas son TEXT y no DATE/TIMESTAMP: guardan una fecha CIVIL "YYYY-MM-DD"
-- del calendario local del Grupo, misma convención que `deadlineHora` ("HH:mm").
-- Ver la decisión 9 de docs/phases/fase-14-24-destinatario-y-vigencia.md.

-- AlterTable
ALTER TABLE "Actividad" ADD COLUMN "usuariosPermitidos" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Actividad" ADD COLUMN "equiposPermitidos" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Actividad" ADD COLUMN "vigenteDesde" TEXT;
ALTER TABLE "Actividad" ADD COLUMN "vigenteHasta" TEXT;
