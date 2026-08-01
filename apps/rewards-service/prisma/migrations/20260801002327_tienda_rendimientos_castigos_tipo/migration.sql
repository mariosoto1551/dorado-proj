-- CreateEnum
CREATE TYPE "TipoItemCatalogo" AS ENUM ('PREMIO', 'CASTIGO');

-- AlterTable
ALTER TABLE "Recompensa" ADD COLUMN     "tipo" "TipoItemCatalogo" NOT NULL DEFAULT 'PREMIO',
ALTER COLUMN "umbralZonaId" DROP NOT NULL,
ALTER COLUMN "nombreZonaSnapshot" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RendimientoZona" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "umbralZonaId" TEXT NOT NULL,
    "nombreZonaSnapshot" TEXT NOT NULL,
    "monedas" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RendimientoZona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CastigoAsignado" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "seccionId" TEXT NOT NULL,
    "recompensaId" TEXT NOT NULL,
    "nombreRecompensaSnapshot" TEXT NOT NULL,
    "deudaSaldada" INTEGER NOT NULL,
    "estado" "EstadoCanje" NOT NULL DEFAULT 'PENDIENTE_ENTREGA',
    "entregadaPorTutorId" TEXT,
    "entregadaEn" TIMESTAMP(3),
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorTutorId" TEXT,
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CastigoAsignado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RendimientoZona_umbralZonaId_key" ON "RendimientoZona"("umbralZonaId");

-- CreateIndex
CREATE INDEX "RendimientoZona_organizacionId_idx" ON "RendimientoZona"("organizacionId");

-- CreateIndex
CREATE INDEX "RendimientoZona_grupoId_idx" ON "RendimientoZona"("grupoId");

-- CreateIndex
CREATE INDEX "CastigoAsignado_organizacionId_idx" ON "CastigoAsignado"("organizacionId");

-- CreateIndex
CREATE INDEX "CastigoAsignado_grupoId_estado_idx" ON "CastigoAsignado"("grupoId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "CastigoAsignado_usuarioId_seccionId_key" ON "CastigoAsignado"("usuarioId", "seccionId");
