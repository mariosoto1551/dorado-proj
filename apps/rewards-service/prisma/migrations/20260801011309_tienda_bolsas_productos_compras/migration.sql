-- CreateEnum
CREATE TYPE "FuenteProducto" AS ENUM ('ITEM', 'BOLSA');

-- CreateEnum
CREATE TYPE "MecanicaProducto" AS ENUM ('AZAR', 'ELECCION');

-- CreateTable
CREATE TABLE "BolsaPremios" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" "EstadoCatalogo" NOT NULL DEFAULT 'ACTIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BolsaPremios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemBolsa" (
    "id" TEXT NOT NULL,
    "bolsaId" TEXT NOT NULL,
    "recompensaId" TEXT NOT NULL,

    CONSTRAINT "ItemBolsa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoTienda" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "imagenUrl" TEXT,
    "precio" INTEGER NOT NULL,
    "fuente" "FuenteProducto" NOT NULL,
    "mecanica" "MecanicaProducto" NOT NULL DEFAULT 'AZAR',
    "recompensaId" TEXT,
    "bolsaId" TEXT,
    "estado" "EstadoCatalogo" NOT NULL DEFAULT 'ACTIVA',
    "creadoPorTutorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductoTienda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compra" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "nombreProductoSnapshot" TEXT NOT NULL,
    "precioSnapshot" INTEGER NOT NULL,
    "obtenidoPorAzar" BOOLEAN NOT NULL,
    "recompensaId" TEXT NOT NULL,
    "nombreRecompensaSnapshot" TEXT NOT NULL,
    "estado" "EstadoCanje" NOT NULL DEFAULT 'PENDIENTE_ENTREGA',
    "entregadaPorTutorId" TEXT,
    "entregadaEn" TIMESTAMP(3),
    "revertidaEn" TIMESTAMP(3),
    "revertidaPorTutorId" TEXT,
    "motivoReversion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Compra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BolsaPremios_organizacionId_idx" ON "BolsaPremios"("organizacionId");

-- CreateIndex
CREATE INDEX "BolsaPremios_grupoId_idx" ON "BolsaPremios"("grupoId");

-- CreateIndex
CREATE INDEX "ItemBolsa_bolsaId_idx" ON "ItemBolsa"("bolsaId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemBolsa_bolsaId_recompensaId_key" ON "ItemBolsa"("bolsaId", "recompensaId");

-- CreateIndex
CREATE INDEX "ProductoTienda_organizacionId_idx" ON "ProductoTienda"("organizacionId");

-- CreateIndex
CREATE INDEX "ProductoTienda_grupoId_estado_idx" ON "ProductoTienda"("grupoId", "estado");

-- CreateIndex
CREATE INDEX "Compra_organizacionId_idx" ON "Compra"("organizacionId");

-- CreateIndex
CREATE INDEX "Compra_grupoId_estado_idx" ON "Compra"("grupoId", "estado");

-- CreateIndex
CREATE INDEX "Compra_usuarioId_createdAt_idx" ON "Compra"("usuarioId", "createdAt");

-- AddForeignKey
ALTER TABLE "ItemBolsa" ADD CONSTRAINT "ItemBolsa_bolsaId_fkey" FOREIGN KEY ("bolsaId") REFERENCES "BolsaPremios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
