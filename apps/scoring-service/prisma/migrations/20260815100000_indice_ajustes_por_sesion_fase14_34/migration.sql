-- fase-14-34: índice para los ajustes manuales de UNA Sesión.
--
-- El historial de la sesión (activity-service) ahora pide por REST interno los
-- asientos AJUSTE_MANUAL de una Sesión, ordenados por createdAt desc. Los
-- índices que había son por (usuarioId, seccionId) y por origenId: ninguno
-- sirve para ese filtro, y el timeline se auto-refresca cada 30 s.
--
-- Aditiva pura: crea un índice, no toca una sola fila.

-- CreateIndex
CREATE INDEX "EventoPuntos_grupoId_sesionId_createdAt_idx" ON "EventoPuntos"("grupoId", "sesionId", "createdAt");
