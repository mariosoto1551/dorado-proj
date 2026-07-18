-- CreateEnum
CREATE TYPE "EstadoCatalogo" AS ENUM ('ACTIVA', 'ARCHIVADA');

-- CreateEnum
CREATE TYPE "MecanicaRecompensa" AS ENUM ('SELECCION', 'AZAR');

-- CreateEnum
CREATE TYPE "EstadoCanje" AS ENUM ('PENDIENTE_ENTREGA', 'ENTREGADA');

-- CreateTable
CREATE TABLE "Recompensa" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "umbralZonaId" TEXT NOT NULL,
    "nombreZonaSnapshot" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "imagenUrl" TEXT,
    "permiteSeleccion" BOOLEAN NOT NULL DEFAULT false,
    "permiteAzar" BOOLEAN NOT NULL DEFAULT false,
    "estado" "EstadoCatalogo" NOT NULL DEFAULT 'ACTIVA',
    "creadaPorTutorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recompensa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanjeRecompensa" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "seccionId" TEXT NOT NULL,
    "recompensaId" TEXT NOT NULL,
    "mecanica" "MecanicaRecompensa" NOT NULL,
    "estado" "EstadoCanje" NOT NULL DEFAULT 'PENDIENTE_ENTREGA',
    "entregadaPorTutorId" TEXT,
    "entregadaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanjeRecompensa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoProcesado" (
    "eventId" TEXT NOT NULL,
    "consumidor" TEXT NOT NULL,
    "procesadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoProcesado_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "Recompensa_organizacionId_idx" ON "Recompensa"("organizacionId");

-- CreateIndex
CREATE INDEX "Recompensa_grupoId_idx" ON "Recompensa"("grupoId");

-- CreateIndex
CREATE INDEX "Recompensa_umbralZonaId_idx" ON "Recompensa"("umbralZonaId");

-- CreateIndex
CREATE INDEX "CanjeRecompensa_organizacionId_idx" ON "CanjeRecompensa"("organizacionId");

-- CreateIndex
CREATE INDEX "CanjeRecompensa_grupoId_seccionId_idx" ON "CanjeRecompensa"("grupoId", "seccionId");

-- CreateIndex
CREATE UNIQUE INDEX "CanjeRecompensa_usuarioId_seccionId_key" ON "CanjeRecompensa"("usuarioId", "seccionId");
