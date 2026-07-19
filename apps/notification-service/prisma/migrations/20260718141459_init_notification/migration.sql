-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "destinatarioId" TEXT NOT NULL,
    "destinatarioTipo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoProcesado" (
    "eventId" TEXT NOT NULL,
    "consumidor" TEXT NOT NULL,
    "procesadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoProcesado_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "Notificacion_destinatarioId_leida_idx" ON "Notificacion"("destinatarioId", "leida");

-- CreateIndex
CREATE INDEX "Notificacion_organizacionId_idx" ON "Notificacion"("organizacionId");
