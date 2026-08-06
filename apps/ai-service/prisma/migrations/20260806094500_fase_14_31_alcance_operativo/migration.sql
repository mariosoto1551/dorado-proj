-- AlterEnum
-- fase-14-31 — alcance operativo del asistente. Aditiva: las filas existentes
-- conservan sus valores, sin backfill.
-- Postgres 12+ admite varios ADD VALUE en la misma migración.
ALTER TYPE "TipoPropuesta" ADD VALUE 'ARCHIVAR_CATALOGO';
ALTER TYPE "TipoPropuesta" ADD VALUE 'QUITAR_MARCAS';
ALTER TYPE "TipoPropuesta" ADD VALUE 'AJUSTES_MANUALES';
ALTER TYPE "TipoPropuesta" ADD VALUE 'ANOTAR_REGISTROS';
