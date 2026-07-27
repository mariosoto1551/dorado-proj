-- fase-14-10: contenido creado por los integrantes, gated por config del Grupo.
-- Retro-compatible: toda actividad preexistente queda origen = TUTOR con autor
-- nulo, y ningún grupo cambia de modo (la fila de config es perezosa: sin fila
-- se aplican los defaults RESTRICTIVO / 5 / 5).

-- CreateEnum
CREATE TYPE "OrigenActividad" AS ENUM ('TUTOR', 'USUARIO');

-- CreateEnum
CREATE TYPE "ModoCreacionContenidoUsuario" AS ENUM ('RESTRICTIVO', 'BAJO_APROBACION', 'LIBRE');

-- CreateEnum
CREATE TYPE "EstadoPropuesta" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- AlterTable
ALTER TABLE "Actividad" ADD COLUMN     "origen" "OrigenActividad" NOT NULL DEFAULT 'TUTOR',
ADD COLUMN     "creadaPorUsuarioId" TEXT;

-- AlterTable: creadaPorTutorId pasa a nullable (una actividad creada en modo
-- LIBRE no tiene tutor detrás). Relajar el NOT NULL no toca las filas existentes.
ALTER TABLE "Actividad" ALTER COLUMN "creadaPorTutorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ConfiguracionContenidoGrupo" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "modoCreacionUsuario" "ModoCreacionContenidoUsuario" NOT NULL DEFAULT 'RESTRICTIVO',
    "maxPuntosActividadUsuario" INTEGER NOT NULL DEFAULT 5,
    "maxActividadesActivasPorUsuario" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionContenidoGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropuestaActividad" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "creadaPorUsuarioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "valorPuntos" INTEGER NOT NULL,
    "repeticionesMaximasSesion" INTEGER NOT NULL DEFAULT 1,
    "estado" "EstadoPropuesta" NOT NULL DEFAULT 'PENDIENTE',
    "modoAlCrear" "ModoCreacionContenidoUsuario" NOT NULL,
    "resueltoPorId" TEXT,
    "resueltoPorTipo" TEXT,
    "resueltoEn" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "actividadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropuestaActividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Actividad_grupoId_creadaPorUsuarioId_idx" ON "Actividad"("grupoId", "creadaPorUsuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionContenidoGrupo_grupoId_key" ON "ConfiguracionContenidoGrupo"("grupoId");

-- CreateIndex
CREATE INDEX "ConfiguracionContenidoGrupo_organizacionId_idx" ON "ConfiguracionContenidoGrupo"("organizacionId");

-- CreateIndex
CREATE INDEX "PropuestaActividad_organizacionId_idx" ON "PropuestaActividad"("organizacionId");

-- CreateIndex
CREATE INDEX "PropuestaActividad_grupoId_estado_idx" ON "PropuestaActividad"("grupoId", "estado");

-- CreateIndex
CREATE INDEX "PropuestaActividad_creadaPorUsuarioId_idx" ON "PropuestaActividad"("creadaPorUsuarioId");
