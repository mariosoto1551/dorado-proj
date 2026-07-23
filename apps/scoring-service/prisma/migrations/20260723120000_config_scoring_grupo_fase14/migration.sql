-- Config de scoring por Grupo (fase-14): base de puntos iniciales por Sección.
CREATE TABLE "ConfiguracionScoringGrupo" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "puntosIniciales" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionScoringGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionScoringGrupo_grupoId_key" ON "ConfiguracionScoringGrupo"("grupoId");

-- CreateIndex
CREATE INDEX "ConfiguracionScoringGrupo_organizacionId_idx" ON "ConfiguracionScoringGrupo"("organizacionId");
