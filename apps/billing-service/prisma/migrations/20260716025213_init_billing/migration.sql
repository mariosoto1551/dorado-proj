-- CreateEnum
CREATE TYPE "CodigoPlan" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "EstadoSuscripcion" AS ENUM ('ACTIVA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "FuenteSuscripcion" AS ENUM ('AUTOMATICA', 'MANUAL');

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "codigo" "CodigoPlan" NOT NULL,
    "nombre" TEXT NOT NULL,
    "limiteTutores" INTEGER,
    "limiteUsuarios" INTEGER,
    "limiteGrupos" INTEGER,
    "limiteActividadesPorGrupo" INTEGER,
    "whiteLabel" BOOLEAN NOT NULL DEFAULT false,
    "reportesAvanzados" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suscripcion" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "estado" "EstadoSuscripcion" NOT NULL DEFAULT 'ACTIVA',
    "fuente" "FuenteSuscripcion" NOT NULL DEFAULT 'AUTOMATICA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoProcesado" (
    "eventId" TEXT NOT NULL,
    "consumidor" TEXT NOT NULL,
    "procesadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoProcesado_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_codigo_key" ON "Plan"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Suscripcion_organizacionId_key" ON "Suscripcion"("organizacionId");

-- AddForeignKey
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
