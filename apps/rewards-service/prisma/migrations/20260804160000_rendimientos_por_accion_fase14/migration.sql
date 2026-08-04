-- fase-14-28: la segunda fuente de la economía (monedas por cumplir).
-- Migración ADITIVA pura: no toca ninguna tabla existente, así que un grupo en
-- DIRECTO no cambia de comportamiento ni tiene una sola columna muerta.

-- CreateEnum
CREATE TYPE "TipoAccionRendimiento" AS ENUM ('ACTIVIDAD', 'CONDUCTA');

-- AlterEnum
ALTER TYPE "TipoMovimientoMoneda" ADD VALUE 'RENDIMIENTO_ACCION';
ALTER TYPE "TipoMovimientoMoneda" ADD VALUE 'REVERSION_ACCION';

-- CreateTable
CREATE TABLE "RendimientoAccion" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "tipoAccion" "TipoAccionRendimiento" NOT NULL,
    "origenId" TEXT NOT NULL,
    "nombreSnapshot" TEXT NOT NULL,
    "monedas" INTEGER NOT NULL,
    "monedasBonoJefe" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RendimientoAccion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RendimientoAccion_organizacionId_idx" ON "RendimientoAccion"("organizacionId");

-- CreateIndex
CREATE INDEX "RendimientoAccion_grupoId_idx" ON "RendimientoAccion"("grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "RendimientoAccion_tipoAccion_origenId_key" ON "RendimientoAccion"("tipoAccion", "origenId");
