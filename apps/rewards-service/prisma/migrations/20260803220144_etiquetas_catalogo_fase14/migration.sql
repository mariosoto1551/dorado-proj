-- CreateTable
CREATE TABLE "EtiquetaCatalogo" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL,
    "estado" "EstadoCatalogo" NOT NULL DEFAULT 'ACTIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EtiquetaCatalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtiquetaEnRecompensa" (
    "id" TEXT NOT NULL,
    "etiquetaId" TEXT NOT NULL,
    "recompensaId" TEXT NOT NULL,

    CONSTRAINT "EtiquetaEnRecompensa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EtiquetaCatalogo_organizacionId_idx" ON "EtiquetaCatalogo"("organizacionId");

-- CreateIndex
CREATE INDEX "EtiquetaCatalogo_grupoId_estado_idx" ON "EtiquetaCatalogo"("grupoId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "EtiquetaCatalogo_grupoId_nombre_key" ON "EtiquetaCatalogo"("grupoId", "nombre");

-- CreateIndex
CREATE INDEX "EtiquetaEnRecompensa_recompensaId_idx" ON "EtiquetaEnRecompensa"("recompensaId");

-- CreateIndex
CREATE UNIQUE INDEX "EtiquetaEnRecompensa_etiquetaId_recompensaId_key" ON "EtiquetaEnRecompensa"("etiquetaId", "recompensaId");

-- AddForeignKey
ALTER TABLE "EtiquetaEnRecompensa" ADD CONSTRAINT "EtiquetaEnRecompensa_etiquetaId_fkey" FOREIGN KEY ("etiquetaId") REFERENCES "EtiquetaCatalogo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtiquetaEnRecompensa" ADD CONSTRAINT "EtiquetaEnRecompensa_recompensaId_fkey" FOREIGN KEY ("recompensaId") REFERENCES "Recompensa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
