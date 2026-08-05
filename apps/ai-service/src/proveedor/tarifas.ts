/**
 * Tarifas del proveedor, en dólares por millón de tokens (fase-14-29).
 *
 * Se guarda el costo de CADA llamada en `Mensaje.costoMicroUsd` con la tarifa
 * vigente en ese momento: es un snapshot, igual que `nombreSnapshot` del
 * fase-14-28. La tarifa de mañana no reescribe lo que costó ayer, así que esta
 * tabla se puede actualizar sin corromper el histórico.
 *
 * **Esto NO es el corte de cuota.** La cuota se mide en TOKENS (decisión 8),
 * que es un número que el proveedor reporta y nosotros no estimamos. El costo
 * es para saber cuánto salió, no para decidir si se sigue: si esta tabla queda
 * desactualizada, el reporte miente pero el corte sigue siendo exacto.
 */
export interface TarifaModelo {
  /** USD por millón de tokens de entrada. */
  entrada: number;
  /** USD por millón de tokens de entrada servidos desde caché (prompt_cache_key). */
  entradaCacheada: number;
  /** USD por millón de tokens de salida. Incluye los de razonamiento. */
  salida: number;
}

/**
 * Verificado contra la doc del proveedor el 2026-08-04. Los tres modelos de
 * frontera soportan function calling, que es el requisito no negociable acá.
 */
export const TARIFAS: Record<string, TarifaModelo> = {
  'gpt-5.6-sol': { entrada: 5.0, entradaCacheada: 0.5, salida: 30.0 },
  'gpt-5.6-terra': { entrada: 2.0, entradaCacheada: 0.2, salida: 12.0 },
  'gpt-5.6-luna': { entrada: 0.2, entradaCacheada: 0.02, salida: 1.2 },
};

/**
 * Tarifa de un modelo desconocido: la MÁS CARA de las conocidas, no cero.
 *
 * Un modelo nuevo configurado en el `.env` no tiene por qué reportar costo 0
 * —eso diría que el asistente es gratis justo cuando nadie sabe cuánto sale—.
 * Sobreestimar es el error barato; subestimar es el que se descubre en la
 * factura.
 */
function tarifaMasCara(): TarifaModelo {
  return Object.values(TARIFAS).reduce((masCara, tarifa) =>
    tarifa.salida > masCara.salida ? tarifa : masCara
  );
}

export function tarifaDe(modelo: string): TarifaModelo {
  return TARIFAS[modelo] ?? tarifaMasCara();
}

export interface UsoTokens {
  entrada: number;
  salida: number;
  /** Parte de `entrada` que el proveedor sirvió desde caché. */
  entradaCacheada: number;
}

/**
 * Costo de una llamada en millonésimas de dólar (enteros — regla 5 del
 * proyecto llevada al dinero: nada de `Float` para algo que se suma).
 *
 * La cuenta sale redonda por cómo están expresadas las tarifas: si el precio
 * es "USD por millón de tokens", entonces
 *
 *   costo_usd    = tokens × precio / 1e6
 *   costo_microusd = costo_usd × 1e6 = tokens × precio
 *
 * o sea que multiplicar tokens por el precio del millón ya da micro-dólares,
 * sin divisiones intermedias que pierdan precisión.
 */
export function costoMicroUsd(modelo: string, uso: UsoTokens): number {
  const tarifa = tarifaDe(modelo);
  const entradaPlena = Math.max(uso.entrada - uso.entradaCacheada, 0);

  return Math.round(
    entradaPlena * tarifa.entrada +
      uso.entradaCacheada * tarifa.entradaCacheada +
      uso.salida * tarifa.salida
  );
}
