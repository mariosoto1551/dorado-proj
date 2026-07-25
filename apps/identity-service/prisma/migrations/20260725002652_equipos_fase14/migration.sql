-- CreateEnum
CREATE TYPE "RolEquipoMiembro" AS ENUM ('JEFE', 'MIEMBRO');

-- CreateTable
CREATE TABLE "Equipo" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" "EstadoCuenta" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipoMiembro" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "rol" "RolEquipoMiembro" NOT NULL DEFAULT 'MIEMBRO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipoMiembro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Equipo_organizacionId_idx" ON "Equipo"("organizacionId");

-- CreateIndex
CREATE INDEX "Equipo_grupoId_idx" ON "Equipo"("grupoId");

-- CreateIndex
CREATE INDEX "EquipoMiembro_organizacionId_idx" ON "EquipoMiembro"("organizacionId");

-- CreateIndex
CREATE INDEX "EquipoMiembro_usuarioId_idx" ON "EquipoMiembro"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipoMiembro_equipoId_usuarioId_key" ON "EquipoMiembro"("equipoId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipoMiembro_grupoId_usuarioId_key" ON "EquipoMiembro"("grupoId", "usuarioId");

-- AddForeignKey
ALTER TABLE "Equipo" ADD CONSTRAINT "Equipo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipoMiembro" ADD CONSTRAINT "EquipoMiembro_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "Equipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
