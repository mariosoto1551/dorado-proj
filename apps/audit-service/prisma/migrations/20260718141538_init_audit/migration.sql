-- CreateTable
CREATE TABLE "RegistroAuditoria" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorTipo" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidadTipo" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "detalle" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoProcesado" (
    "eventId" TEXT NOT NULL,
    "consumidor" TEXT NOT NULL,
    "procesadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoProcesado_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "RegistroAuditoria_organizacionId_idx" ON "RegistroAuditoria"("organizacionId");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_grupoId_idx" ON "RegistroAuditoria"("grupoId");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_entidadTipo_entidadId_idx" ON "RegistroAuditoria"("entidadTipo", "entidadId");
