-- CreateEnum
CREATE TYPE "ModoRecompensas" AS ENUM ('DIRECTO', 'TIENDA');

-- CreateTable
CREATE TABLE "ConfiguracionRecompensasGrupo" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "modo" "ModoRecompensas" NOT NULL DEFAULT 'DIRECTO',
    "modoPendiente" "ModoRecompensas",
    "nombreMoneda" TEXT NOT NULL DEFAULT 'monedas',
    "iconoMoneda" TEXT NOT NULL DEFAULT '🪙',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionRecompensasGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionRecompensasGrupo_grupoId_key" ON "ConfiguracionRecompensasGrupo"("grupoId");

-- CreateIndex
CREATE INDEX "ConfiguracionRecompensasGrupo_organizacionId_idx" ON "ConfiguracionRecompensasGrupo"("organizacionId");
