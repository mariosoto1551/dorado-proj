-- fase-14-19: roles del participante dentro del Grupo.
-- Retro-compatible: `UsuarioGrupo.rolGrupoId` nace NULL en toda fila existente
-- (= sin rol, el comportamiento previo al ítem) y el catálogo arranca vacío
-- (decisión 7: ningún rol precargado por seed).

-- CreateTable
CREATE TABLE "RolGrupo" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL,
    "estado" "EstadoCuenta" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolGrupo_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "UsuarioGrupo" ADD COLUMN "rolGrupoId" TEXT;

-- CreateIndex
CREATE INDEX "RolGrupo_organizacionId_idx" ON "RolGrupo"("organizacionId");

-- CreateIndex
CREATE INDEX "RolGrupo_grupoId_idx" ON "RolGrupo"("grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "RolGrupo_grupoId_nombre_key" ON "RolGrupo"("grupoId", "nombre");

-- CreateIndex
CREATE INDEX "UsuarioGrupo_rolGrupoId_idx" ON "UsuarioGrupo"("rolGrupoId");

-- AddForeignKey
ALTER TABLE "RolGrupo" ADD CONSTRAINT "RolGrupo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioGrupo" ADD CONSTRAINT "UsuarioGrupo_rolGrupoId_fkey" FOREIGN KEY ("rolGrupoId") REFERENCES "RolGrupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
