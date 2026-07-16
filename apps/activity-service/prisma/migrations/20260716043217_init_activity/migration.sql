-- CreateEnum
CREATE TYPE "TipoPuntaje" AS ENUM ('OPCIONAL', 'OBLIGATORIA');

-- CreateEnum
CREATE TYPE "TipoLimiteTiempo" AS ENUM ('DEADLINE', 'CRONOMETRO', 'SIN_LIMITE');

-- CreateEnum
CREATE TYPE "TipoConducta" AS ENUM ('BUENA', 'MALA');

-- CreateEnum
CREATE TYPE "EstadoCatalogo" AS ENUM ('ACTIVA', 'ARCHIVADA');

-- CreateTable
CREATE TABLE "Actividad" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipoPuntaje" "TipoPuntaje" NOT NULL,
    "valorPuntos" INTEGER NOT NULL,
    "tipoLimiteTiempo" "TipoLimiteTiempo" NOT NULL,
    "deadlineHora" TEXT,
    "duracionCronometroMinutos" INTEGER,
    "repeticionesMaximasSesion" INTEGER NOT NULL DEFAULT 1,
    "repeticionesMaximasSeccion" INTEGER,
    "estado" "EstadoCatalogo" NOT NULL DEFAULT 'ACTIVA',
    "creadaPorTutorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conducta" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoConducta" NOT NULL,
    "valorPuntos" INTEGER NOT NULL,
    "permiteAutoreporte" BOOLEAN NOT NULL DEFAULT false,
    "estado" "EstadoCatalogo" NOT NULL DEFAULT 'ACTIVA',
    "creadaPorTutorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conducta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Actividad_organizacionId_idx" ON "Actividad"("organizacionId");

-- CreateIndex
CREATE INDEX "Actividad_grupoId_idx" ON "Actividad"("grupoId");

-- CreateIndex
CREATE INDEX "Conducta_organizacionId_idx" ON "Conducta"("organizacionId");

-- CreateIndex
CREATE INDEX "Conducta_grupoId_idx" ON "Conducta"("grupoId");
