-- AlterTable
ALTER TABLE "EventoPuntos" ADD COLUMN     "equipoId" TEXT;

-- CreateIndex
CREATE INDEX "EventoPuntos_equipoId_idx" ON "EventoPuntos"("equipoId");
