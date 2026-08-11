-- fase-14-33: marca de carga retroactiva en el ledger.
--
-- Aditiva pura y sin backfill: NULL significa "se escribió en su día". La
-- columna es trazabilidad, no un criterio de suma — ninguna consulta de
-- puntaje la filtra (regla 1: el puntaje se deriva sumando todos los asientos).

-- AlterTable
ALTER TABLE "EventoPuntos" ADD COLUMN     "cargadoRetroactivamenteEn" TIMESTAMP(3);
