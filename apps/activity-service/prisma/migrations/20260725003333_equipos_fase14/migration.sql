-- CreateEnum
CREATE TYPE "AlcanceActividad" AS ENUM ('INDIVIDUAL', 'EQUIPO');

-- CreateEnum
CREATE TYPE "EstadoReporte" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- AlterTable
ALTER TABLE "Actividad" ADD COLUMN     "alcance" "AlcanceActividad" NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "bonoJefePuntos" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RegistroTareaEquipo" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "seccionId" TEXT NOT NULL,
    "valorPuntosSnapshot" INTEGER NOT NULL,
    "bonoJefeSnapshot" INTEGER NOT NULL,
    "jefeUsuarioIdSnapshot" TEXT NOT NULL,
    "miembrosSnapshot" JSONB NOT NULL,
    "completadaPorId" TEXT NOT NULL,
    "completadaPorTipo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroTareaEquipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReporteMiembro" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "reportadoUsuarioId" TEXT NOT NULL,
    "jefeUsuarioId" TEXT NOT NULL,
    "conductaId" TEXT NOT NULL,
    "motivo" TEXT,
    "estado" "EstadoReporte" NOT NULL DEFAULT 'PENDIENTE',
    "resueltoPorTutorId" TEXT,
    "registroConductaId" TEXT,
    "resueltoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReporteMiembro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroTareaEquipo_organizacionId_idx" ON "RegistroTareaEquipo"("organizacionId");

-- CreateIndex
CREATE INDEX "RegistroTareaEquipo_equipoId_sesionId_idx" ON "RegistroTareaEquipo"("equipoId", "sesionId");

-- CreateIndex
CREATE INDEX "ReporteMiembro_organizacionId_idx" ON "ReporteMiembro"("organizacionId");

-- CreateIndex
CREATE INDEX "ReporteMiembro_grupoId_estado_idx" ON "ReporteMiembro"("grupoId", "estado");

-- CreateIndex
CREATE INDEX "ReporteMiembro_equipoId_idx" ON "ReporteMiembro"("equipoId");
