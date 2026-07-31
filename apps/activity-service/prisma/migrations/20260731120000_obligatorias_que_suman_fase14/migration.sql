-- fase-14-20: las obligatorias también suman al cumplirse. `valorPuntos` sigue
-- siendo el castigo por no hacerla; `puntosPorCumplir` es el premio por hacerla.
-- Retro-compatible por construcción: arranca en 0 para toda actividad existente,
-- así que ninguna cambia de comportamiento (confirmar sigue valiendo 0 y sin
-- asiento en el ledger) hasta que un Tutor cargue un valor positivo.

-- AlterTable
ALTER TABLE "Actividad" ADD COLUMN     "puntosPorCumplir" INTEGER NOT NULL DEFAULT 0;
