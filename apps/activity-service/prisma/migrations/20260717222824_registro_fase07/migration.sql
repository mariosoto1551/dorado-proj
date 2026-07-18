-- CreateEnum
CREATE TYPE "TipoRegistroActividad" AS ENUM ('COMPLETADA', 'NO_HIZO');

-- CreateTable
CREATE TABLE "RegistroActividad" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "seccionId" TEXT NOT NULL,
    "tipo" "TipoRegistroActividad" NOT NULL,
    "valorPuntosSnapshot" INTEGER NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "registradoPorTipo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroActividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroConducta" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "conductaId" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "seccionId" TEXT NOT NULL,
    "valorPuntosSnapshot" INTEGER NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "registradoPorTipo" TEXT NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "eliminadoPorTutorId" TEXT,
    "eliminadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroConducta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronometroActivo" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "iniciadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CronometroActivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroActividad_organizacionId_idx" ON "RegistroActividad"("organizacionId");

-- CreateIndex
CREATE INDEX "RegistroActividad_usuarioId_actividadId_sesionId_idx" ON "RegistroActividad"("usuarioId", "actividadId", "sesionId");

-- CreateIndex
CREATE INDEX "RegistroConducta_organizacionId_idx" ON "RegistroConducta"("organizacionId");

-- CreateIndex
CREATE INDEX "RegistroConducta_usuarioId_conductaId_sesionId_idx" ON "RegistroConducta"("usuarioId", "conductaId", "sesionId");

-- CreateIndex
CREATE UNIQUE INDEX "CronometroActivo_usuarioId_actividadId_sesionId_key" ON "CronometroActivo"("usuarioId", "actividadId", "sesionId");
