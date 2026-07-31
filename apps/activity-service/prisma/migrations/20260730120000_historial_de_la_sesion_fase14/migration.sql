-- fase-14-18: historial de la sesión. La línea de tiempo del grupo NO se
-- materializa: se arma leyendo RegistroActividad + RegistroConducta +
-- RegistroTareaEquipo, que ya existen (spec, decisión 10). La única tabla nueva
-- es la de notas internas del tutor, que no deriva de nada.
-- Retro-compatible por construcción: solo agrega un enum y una tabla vacía.

-- CreateEnum
CREATE TYPE "TipoRegistroHistorial" AS ENUM ('ACTIVIDAD', 'CONDUCTA', 'TAREA_EQUIPO');

-- CreateTable
CREATE TABLE "NotaRegistro" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "registroTipo" "TipoRegistroHistorial" NOT NULL,
    "registroId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "autorTutorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaRegistro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotaRegistro_organizacionId_idx" ON "NotaRegistro"("organizacionId");

-- CreateIndex
CREATE INDEX "NotaRegistro_registroTipo_registroId_idx" ON "NotaRegistro"("registroTipo", "registroId");
