-- CreateTable
CREATE TABLE "ObjetivoParticipante" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjetivoParticipante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ObjetivoParticipante_organizacionId_idx" ON "ObjetivoParticipante"("organizacionId");

-- CreateIndex
CREATE INDEX "ObjetivoParticipante_grupoId_idx" ON "ObjetivoParticipante"("grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "ObjetivoParticipante_usuarioId_grupoId_key" ON "ObjetivoParticipante"("usuarioId", "grupoId");
