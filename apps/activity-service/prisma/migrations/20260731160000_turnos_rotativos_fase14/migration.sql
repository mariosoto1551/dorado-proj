-- fase-14-21: turnos rotativos de una obligatoria.
-- Retro-compatible por construcción: NO toca la tabla Actividad. Una actividad
-- sin fila en TurnoActividad se comporta exactamente como antes del ítem.

-- CreateEnum
CREATE TYPE "ModoTurno" AS ENUM ('ORDEN_FIJO', 'AZAR');

-- CreateEnum
CREATE TYPE "FrecuenciaTurno" AS ENUM ('SESION', 'SECCION');

-- CreateTable
CREATE TABLE "TurnoActividad" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "modo" "ModoTurno" NOT NULL DEFAULT 'ORDEN_FIJO',
    "frecuencia" "FrecuenciaTurno" NOT NULL DEFAULT 'SESION',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TurnoActividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosicionTurno" (
    "id" TEXT NOT NULL,
    "turnoActividadId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "PosicionTurno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VueltaTurno" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "turnoActividadId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "ordenUsuarioIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VueltaTurno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsignacionTurno" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "ambitoId" TEXT NOT NULL,
    "sesionId" TEXT,
    "seccionId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "vueltaNumero" INTEGER NOT NULL,
    "indice" INTEGER NOT NULL,
    "usuarioOriginalId" TEXT,
    "reasignadoPorTutorId" TEXT,
    "reasignadoEn" TIMESTAMP(3),
    "motivoReasignacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsignacionTurno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TurnoActividad_actividadId_key" ON "TurnoActividad"("actividadId");

-- CreateIndex
CREATE INDEX "TurnoActividad_organizacionId_idx" ON "TurnoActividad"("organizacionId");

-- CreateIndex
CREATE INDEX "TurnoActividad_grupoId_idx" ON "TurnoActividad"("grupoId");

-- CreateIndex
CREATE INDEX "PosicionTurno_turnoActividadId_idx" ON "PosicionTurno"("turnoActividadId");

-- CreateIndex
CREATE UNIQUE INDEX "PosicionTurno_turnoActividadId_orden_key" ON "PosicionTurno"("turnoActividadId", "orden");

-- CreateIndex
CREATE INDEX "VueltaTurno_organizacionId_idx" ON "VueltaTurno"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "VueltaTurno_turnoActividadId_numero_key" ON "VueltaTurno"("turnoActividadId", "numero");

-- CreateIndex
CREATE INDEX "AsignacionTurno_organizacionId_idx" ON "AsignacionTurno"("organizacionId");

-- CreateIndex
CREATE INDEX "AsignacionTurno_grupoId_usuarioId_idx" ON "AsignacionTurno"("grupoId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionTurno_actividadId_ambitoId_key" ON "AsignacionTurno"("actividadId", "ambitoId");

-- AddForeignKey
ALTER TABLE "PosicionTurno" ADD CONSTRAINT "PosicionTurno_turnoActividadId_fkey" FOREIGN KEY ("turnoActividadId") REFERENCES "TurnoActividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VueltaTurno" ADD CONSTRAINT "VueltaTurno_turnoActividadId_fkey" FOREIGN KEY ("turnoActividadId") REFERENCES "TurnoActividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
