-- CreateEnum
CREATE TYPE "RolMensaje" AS ENUM ('USUARIO', 'ASISTENTE', 'HERRAMIENTA', 'SISTEMA');

-- CreateEnum
CREATE TYPE "EstadoPropuesta" AS ENUM ('BORRADOR', 'APLICADA', 'APLICADA_PARCIAL', 'DESCARTADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "TipoPropuesta" AS ENUM ('CREAR_ACTIVIDADES', 'EDITAR_ACTIVIDADES', 'PRECIOS_TIENDA', 'RENDIMIENTOS_MONEDAS');

-- CreateTable
CREATE TABLE "ConfiguracionIaOrganizacion" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "habilitada" BOOLEAN NOT NULL DEFAULT false,
    "aceptoAvisoEn" TIMESTAMP(3),
    "aceptoAvisoPorUsuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionIaOrganizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversacion" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "archivada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensaje" (
    "id" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "rol" "RolMensaje" NOT NULL,
    "contenido" TEXT NOT NULL,
    "herramienta" TEXT,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSalida" INTEGER NOT NULL DEFAULT 0,
    "costoMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "modelo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Propuesta" (
    "id" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "tipo" "TipoPropuesta" NOT NULL,
    "operaciones" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "estado" "EstadoPropuesta" NOT NULL DEFAULT 'BORRADOR',
    "venceEn" TIMESTAMP(3) NOT NULL,
    "aplicadaEn" TIMESTAMP(3),
    "aplicadaPorUsuarioId" TEXT,
    "resultado" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Propuesta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionIaOrganizacion_organizacionId_key" ON "ConfiguracionIaOrganizacion"("organizacionId");

-- CreateIndex
CREATE INDEX "Conversacion_organizacionId_grupoId_usuarioId_idx" ON "Conversacion"("organizacionId", "grupoId", "usuarioId");

-- CreateIndex
CREATE INDEX "Mensaje_conversacionId_createdAt_idx" ON "Mensaje"("conversacionId", "createdAt");

-- CreateIndex
CREATE INDEX "Mensaje_organizacionId_createdAt_idx" ON "Mensaje"("organizacionId", "createdAt");

-- CreateIndex
CREATE INDEX "Propuesta_organizacionId_grupoId_idx" ON "Propuesta"("organizacionId", "grupoId");

-- AddForeignKey
ALTER TABLE "Mensaje" ADD CONSTRAINT "Mensaje_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "Conversacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Propuesta" ADD CONSTRAINT "Propuesta_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "Conversacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
