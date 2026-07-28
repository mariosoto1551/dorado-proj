-- fase-14-17: el plan del día. Las OPCIONALES individuales del catálogo del
-- tutor se ocultan de la lista del integrante hasta que él las elige.
-- Retro-compatible por construcción: las dos columnas nuevas arrancan en false,
-- así que con `planDelDiaActivo = false` (default) nada cambia para los grupos
-- existentes y la tabla nueva queda vacía sin efecto alguno.

-- AlterTable
ALTER TABLE "Actividad" ADD COLUMN     "siempreVisible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ConfiguracionContenidoGrupo" ADD COLUMN     "planDelDiaActivo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SeleccionPlanDia" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeleccionPlanDia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeleccionPlanDia_organizacionId_idx" ON "SeleccionPlanDia"("organizacionId");

-- CreateIndex
CREATE INDEX "SeleccionPlanDia_usuarioId_sesionId_idx" ON "SeleccionPlanDia"("usuarioId", "sesionId");

-- CreateIndex
CREATE UNIQUE INDEX "SeleccionPlanDia_usuarioId_actividadId_sesionId_key" ON "SeleccionPlanDia"("usuarioId", "actividadId", "sesionId");
