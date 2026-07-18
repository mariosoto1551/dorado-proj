-- CreateEnum
CREATE TYPE "TipoOrigenPuntos" AS ENUM ('ACTIVIDAD_COMPLETADA', 'NO_HIZO', 'CONDUCTA', 'CORRECCION');

-- CreateTable
CREATE TABLE "EventoPuntos" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "seccionId" TEXT NOT NULL,
    "sesionId" TEXT NOT NULL,
    "tipoOrigen" "TipoOrigenPuntos" NOT NULL,
    "origenId" TEXT NOT NULL,
    "puntosSnapshot" INTEGER NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "registradoPorTipo" TEXT NOT NULL,
    "corregidoDeId" TEXT,
    "motivoCorreccion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoPuntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UmbralZona" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "nombreZona" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "puntosMin" INTEGER NOT NULL,
    "puntosMax" INTEGER,
    "colorHex" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UmbralZona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DescalificacionSeccion" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "seccionId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "registradaPorTutorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DescalificacionSeccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultadoSeccion" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "seccionId" TEXT NOT NULL,
    "puntajeTotal" INTEGER NOT NULL,
    "umbralZonaId" TEXT,
    "nombreZona" TEXT,
    "descalificado" BOOLEAN NOT NULL DEFAULT false,
    "calculadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultadoSeccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoProcesado" (
    "eventId" TEXT NOT NULL,
    "consumidor" TEXT NOT NULL,
    "procesadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoProcesado_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "EventoPuntos_organizacionId_idx" ON "EventoPuntos"("organizacionId");

-- CreateIndex
CREATE INDEX "EventoPuntos_usuarioId_seccionId_idx" ON "EventoPuntos"("usuarioId", "seccionId");

-- CreateIndex
CREATE INDEX "EventoPuntos_origenId_idx" ON "EventoPuntos"("origenId");

-- CreateIndex
CREATE INDEX "UmbralZona_grupoId_idx" ON "UmbralZona"("grupoId");

-- CreateIndex
CREATE INDEX "UmbralZona_organizacionId_idx" ON "UmbralZona"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "UmbralZona_grupoId_orden_key" ON "UmbralZona"("grupoId", "orden");

-- CreateIndex
CREATE INDEX "DescalificacionSeccion_organizacionId_idx" ON "DescalificacionSeccion"("organizacionId");

-- CreateIndex
CREATE INDEX "DescalificacionSeccion_seccionId_idx" ON "DescalificacionSeccion"("seccionId");

-- CreateIndex
CREATE UNIQUE INDEX "DescalificacionSeccion_usuarioId_seccionId_key" ON "DescalificacionSeccion"("usuarioId", "seccionId");

-- CreateIndex
CREATE INDEX "ResultadoSeccion_organizacionId_idx" ON "ResultadoSeccion"("organizacionId");

-- CreateIndex
CREATE INDEX "ResultadoSeccion_seccionId_idx" ON "ResultadoSeccion"("seccionId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultadoSeccion_usuarioId_seccionId_key" ON "ResultadoSeccion"("usuarioId", "seccionId");
