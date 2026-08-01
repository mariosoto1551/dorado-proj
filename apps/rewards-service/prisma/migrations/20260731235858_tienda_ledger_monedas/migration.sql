-- CreateEnum
CREATE TYPE "TipoMovimientoMoneda" AS ENUM ('RENDIMIENTO_ZONA', 'MULTA_ZONA', 'SALDO_SALDADO', 'COMPRA', 'AJUSTE_TUTOR', 'REVERSION');

-- CreateTable
CREATE TABLE "EventoMoneda" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoMovimientoMoneda" NOT NULL,
    "monto" INTEGER NOT NULL,
    "seccionId" TEXT,
    "origenId" TEXT,
    "motivo" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "registradoPorTipo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoMoneda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventoMoneda_organizacionId_idx" ON "EventoMoneda"("organizacionId");

-- CreateIndex
CREATE INDEX "EventoMoneda_grupoId_usuarioId_idx" ON "EventoMoneda"("grupoId", "usuarioId");

-- CreateIndex
CREATE INDEX "EventoMoneda_usuarioId_createdAt_idx" ON "EventoMoneda"("usuarioId", "createdAt");
