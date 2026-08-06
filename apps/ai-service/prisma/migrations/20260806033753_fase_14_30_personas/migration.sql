-- AlterEnum
-- fase-14-30 tanda 7 — familia personas. Aditiva: las filas existentes conservan
-- sus valores, sin backfill.
-- Postgres 12+ admite varios ADD VALUE en la misma migración.
ALTER TYPE "TipoPropuesta" ADD VALUE 'ROLES_GRUPO';
ALTER TYPE "TipoPropuesta" ADD VALUE 'EQUIPOS';
