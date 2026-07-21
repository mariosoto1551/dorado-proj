-- CreateEnum
CREATE TYPE "ComportamientoAlCierre" AS ENUM ('ASUME_HECHA', 'REQUIERE_CONFIRMACION');

-- AlterTable
-- Default ASUME_HECHA: toda actividad preexistente conserva el comportamiento
-- actual (sin castigo automático) — cambio retro-compatible (fase-14-08).
ALTER TABLE "Actividad" ADD COLUMN "comportamientoAlCierre" "ComportamientoAlCierre" NOT NULL DEFAULT 'ASUME_HECHA';

-- CreateTable
CREATE TABLE "EventoProcesado" (
    "eventId" TEXT NOT NULL,
    "consumidor" TEXT NOT NULL,
    "procesadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoProcesado_pkey" PRIMARY KEY ("eventId")
);
