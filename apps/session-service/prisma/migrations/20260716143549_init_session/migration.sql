-- CreateEnum
CREATE TYPE "ModoSesion" AS ENUM ('MANUAL', 'AUTOMATICO');

-- CreateEnum
CREATE TYPE "EvaluarUmbralesEn" AS ENUM ('CADA_SESION', 'SOLO_AL_CIERRE_SECCION');

-- CreateEnum
CREATE TYPE "EstadoSeccion" AS ENUM ('ABIERTA', 'EVALUACION', 'CERRADA');

-- CreateEnum
CREATE TYPE "EstadoSesion" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateTable
CREATE TABLE "ConfiguracionSesion" (
    "grupoId" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "modo" "ModoSesion" NOT NULL DEFAULT 'MANUAL',
    "cronAperturaSesion" TEXT,
    "sesionesPorSeccion" INTEGER NOT NULL DEFAULT 1,
    "cronAperturaSeccion" TEXT,
    "evaluarUmbralesEn" "EvaluarUmbralesEn" NOT NULL DEFAULT 'SOLO_AL_CIERRE_SECCION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionSesion_pkey" PRIMARY KEY ("grupoId")
);

-- CreateTable
CREATE TABLE "Seccion" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoSeccion" NOT NULL DEFAULT 'ABIERTA',
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sesion" (
    "id" TEXT NOT NULL,
    "seccionId" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoSesion" NOT NULL DEFAULT 'ABIERTA',
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFin" TIMESTAMP(3),
    "autocierrePospuestoHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UltimoTickProcesado" (
    "grupoId" TEXT NOT NULL,
    "minutoEpoch" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UltimoTickProcesado_pkey" PRIMARY KEY ("grupoId")
);

-- CreateIndex
CREATE INDEX "ConfiguracionSesion_organizacionId_idx" ON "ConfiguracionSesion"("organizacionId");

-- CreateIndex
CREATE INDEX "Seccion_organizacionId_idx" ON "Seccion"("organizacionId");

-- CreateIndex
CREATE INDEX "Seccion_grupoId_idx" ON "Seccion"("grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "Seccion_grupoId_numero_key" ON "Seccion"("grupoId", "numero");

-- CreateIndex
CREATE INDEX "Sesion_organizacionId_idx" ON "Sesion"("organizacionId");

-- CreateIndex
CREATE INDEX "Sesion_grupoId_idx" ON "Sesion"("grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "Sesion_seccionId_numero_key" ON "Sesion"("seccionId", "numero");

-- AddForeignKey
ALTER TABLE "Sesion" ADD CONSTRAINT "Sesion_seccionId_fkey" FOREIGN KEY ("seccionId") REFERENCES "Seccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
