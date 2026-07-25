-- CreateTable
CREATE TABLE "UsuarioGrupo" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsuarioGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsuarioGrupo_grupoId_idx" ON "UsuarioGrupo"("grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioGrupo_usuarioId_grupoId_key" ON "UsuarioGrupo"("usuarioId", "grupoId");

-- AddForeignKey
ALTER TABLE "UsuarioGrupo" ADD CONSTRAINT "UsuarioGrupo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioGrupo" ADD CONSTRAINT "UsuarioGrupo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill (fase-14): la membresía de todo Usuario existente arranca por su grupo
-- de origen, para que UsuarioGrupo sea la fuente de verdad de membresía sin
-- perder a nadie. gen_random_uuid() está disponible en PostgreSQL 13+.
INSERT INTO "UsuarioGrupo" ("id", "usuarioId", "grupoId", "createdAt")
SELECT gen_random_uuid(), "id", "grupoId", "createdAt"
FROM "Usuario"
ON CONFLICT ("usuarioId", "grupoId") DO NOTHING;
