-- fase-14-16: el scheduler pasa de "¿este minuto ES el del cron?" a
-- "¿qué venció desde la última vez que miré?" (ventana `(evaluadoHasta, ahora]`).
--
-- `minutoEpoch` queda sin sentido: un minuto entero no alcanza para delimitar
-- la ventana. Se elimina en vez de dejarlo muerto — es una tabla OPERACIONAL
-- del scheduler (sin organizacionId, sin datos de negocio) que se regenera
-- sola en el primer tick de cada grupo.
--
-- `evaluadoHasta` entra NULL a propósito: las filas que ya existían no deben
-- disparar una recuperación retroactiva al desplegar. NULL = "nunca evaluado",
-- y el primer tick lo fija en `ahora` sin aplicar transiciones.
ALTER TABLE "UltimoTickProcesado" DROP COLUMN "minutoEpoch";
ALTER TABLE "UltimoTickProcesado" ADD COLUMN "evaluadoHasta" TIMESTAMP(3);
