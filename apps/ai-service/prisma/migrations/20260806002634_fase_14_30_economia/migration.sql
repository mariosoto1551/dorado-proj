-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoPropuesta" ADD VALUE 'CREAR_RECOMPENSAS';
ALTER TYPE "TipoPropuesta" ADD VALUE 'EDITAR_RECOMPENSAS';
ALTER TYPE "TipoPropuesta" ADD VALUE 'PRODUCTOS_TIENDA';
ALTER TYPE "TipoPropuesta" ADD VALUE 'ETIQUETAS';
