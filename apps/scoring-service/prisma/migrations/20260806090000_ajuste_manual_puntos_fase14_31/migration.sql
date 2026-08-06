-- fase-14-31 Parte A: el ajuste manual de puntos que scoring nunca tuvo.
-- Aditiva y sin backfill: las filas existentes conservan sus cuatro orígenes y
-- su origenId NOT NULL de hecho, aunque la columna pase a admitir NULL.

-- AlterEnum
ALTER TYPE "TipoOrigenPuntos" ADD VALUE 'AJUSTE_MANUAL';

-- AlterTable: NULL solo en AJUSTE_MANUAL, que no tiene fila de origen.
ALTER TABLE "EventoPuntos" ALTER COLUMN "origenId" DROP NOT NULL;
