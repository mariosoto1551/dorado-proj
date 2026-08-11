-- fase-14-33: marca de carga retroactiva en las tres tablas de registro.
--
-- Aditiva pura y sin backfill a propósito: NULL significa "se cargó en su día",
-- que es exactamente lo que corresponde a todas las filas existentes. Un
-- DEFAULT o un NOT NULL acá inventaría una marca donde no hubo ninguna.

-- `motivoReversion` es columna aparte de `motivoRetroactivo` a propósito: son
-- dos hechos distintos sobre la misma fila («apareció fuera de su día» y «se
-- deshizo fuera de su día»), y uno no debe pisar al otro.

-- AlterTable
ALTER TABLE "RegistroActividad" ADD COLUMN     "cargadoRetroactivamenteEn" TIMESTAMP(3),
ADD COLUMN     "motivoRetroactivo" TEXT,
ADD COLUMN     "motivoReversion" TEXT;

-- AlterTable
ALTER TABLE "RegistroConducta" ADD COLUMN     "cargadoRetroactivamenteEn" TIMESTAMP(3),
ADD COLUMN     "motivoRetroactivo" TEXT;

-- AlterTable
ALTER TABLE "RegistroTareaEquipo" ADD COLUMN     "cargadoRetroactivamenteEn" TIMESTAMP(3),
ADD COLUMN     "motivoRetroactivo" TEXT,
ADD COLUMN     "motivoReversion" TEXT;
